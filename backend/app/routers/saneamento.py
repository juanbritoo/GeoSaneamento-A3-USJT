from typing import Literal, Optional

from fastapi import APIRouter, HTTPException, Query

from ..db import cursor
from ..schemas import ErroAPI, IndicadorCatalogo, SaneamentoResponse

router = APIRouter()


@router.get(
    "/api/v1/saneamento",
    response_model=SaneamentoResponse,
    summary="Consulta de saneamento por escala territorial",
    description=(
        "Consulta valores disponíveis na escala municipal ou distrital. "
        "A escala municipal usa São Paulo como padrão; sem identificador distrital, "
        "consulta distritos. Territórios existentes sem valores são retornados com "
        "indicadores como lista vazia. A resposta preserva fonte, procedência e is_mock."
    ),
    responses={
        404: {"model": ErroAPI, "description": "Território não encontrado na escala informada."},
        422: {"model": ErroAPI, "description": "Parâmetro inválido ou indicador inexistente."},
        503: {"model": ErroAPI, "description": "Banco de dados indisponível."},
    },
    tags=["US02 - Saneamento"],
)
def consultar_saneamento(
    escala: Literal["municipio", "distrito"] = Query(..., description="Escala territorial da consulta."),
    id_territorial: Optional[str] = Query(
        None,
        min_length=7,
        max_length=9,
        description="Código IBGE do município ou distrito. Município padrão: São Paulo (3550308).",
    ),
    indicador: Optional[str] = Query(
        None, min_length=1, max_length=200, description="Código existente no catálogo de indicadores."
    ),
    periodo: Optional[str] = Query(None, min_length=1, max_length=50, description="Período de referência armazenado."),
):
    if id_territorial is not None:
        tamanho_esperado = 7 if escala == "municipio" else 9
        if not id_territorial.isascii() or not id_territorial.isdigit() or len(id_territorial) != tamanho_esperado:
            formato = "7 dígitos para município" if escala == "municipio" else "9 dígitos para distrito"
            raise HTTPException(422, f"id_territorial deve conter {formato}.")

    if escala == "municipio":
        id_consulta = id_territorial or "3550308"
        filtro_id, params_territorio = "id_territorial = %s", (id_consulta,)
    elif id_territorial is not None:
        filtro_id, params_territorio = "id_territorial = %s", (id_territorial,)
    else:
        filtro_id, params_territorio = "TRUE", ()

    with cursor() as cur:
        cur.execute(
            f"SELECT id_territorial, nome FROM territorio WHERE nivel = %s AND {filtro_id} ORDER BY nome",
            (escala, *params_territorio),
        )
        territorios = cur.fetchall()
        if id_territorial is not None or escala == "municipio":
            if not territorios:
                raise HTTPException(404, "Território não encontrado na escala informada.")

        if indicador is not None:
            cur.execute("SELECT 1 FROM indicador WHERE codigo = %s", (indicador,))
            if cur.fetchone() is None:
                raise HTTPException(422, "Indicador inexistente no catálogo.")

        ids = [territorio["id_territorial"] for territorio in territorios]
        if not ids:
            return {"escala": escala, "territorios": []}

        filtros = ["v.id_territorial = ANY(%s)"]
        parametros = [ids]
        if indicador is not None:
            filtros.append("v.indicador = %s")
            parametros.append(indicador)
        if periodo is not None:
            filtros.append("v.periodo = %s")
            parametros.append(periodo)

        cur.execute(
            """
            SELECT v.id_territorial, v.indicador AS codigo, i.nome,
                   v.valor::float8 AS valor, v.unidade, v.fonte, v.periodo,
                   v.is_mock, v.id_fonte, f.classificacao AS classificacao_fonte,
                   f.procedencia, v.dimensoes
            FROM valor_indicador v
            JOIN indicador i ON i.codigo = v.indicador
            JOIN fonte_dado f ON f.id_fonte = v.id_fonte
            WHERE """ + " AND ".join(filtros) + " ORDER BY v.id_territorial, v.periodo, v.indicador",
            tuple(parametros),
        )
        valores = cur.fetchall()

    por_territorio = {
        item["id_territorial"]: {**item, "indicadores": []} for item in territorios
    }
    for valor in valores:
        id_valor = valor.pop("id_territorial")
        por_territorio[id_valor]["indicadores"].append(valor)

    return {"escala": escala, "territorios": list(por_territorio.values())}


@router.get(
    "/indicadores",
    response_model=list[IndicadorCatalogo],
    responses={503: {"model": ErroAPI, "description": "Banco de dados indisponível."}},
    tags=["Compatibilidade"],
)
def catalogo_indicadores():
    with cursor() as cur:
        cur.execute("SELECT codigo, nome, unidade FROM indicador ORDER BY codigo")
        return cur.fetchall()
