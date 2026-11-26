from typing import Annotated, Optional

from fastapi import APIRouter, Body, HTTPException, Query
from psycopg.types.json import Jsonb

from ..db import cursor
from ..schemas import (
    ErroAPI,
    QuestionarioEntradaV2, QuestionarioListaV2, QuestionarioRespostaV2,
)

router = APIRouter()


@router.post(
    "/api/v1/questionario",
    response_model=QuestionarioRespostaV2,
    status_code=201,
    summary="Registra as respostas do questionário de um distrito",
    description=(
        "Versao 2: questionario participativo, sem pontuacao ou classificacao. "
        "Todas as chaves de respostas V2 sao obrigatorias; nao moradores devem "
        "informar null nos sete campos domiciliares. Notas desconhecidas: null."
    ),
    responses={
        404: {"model": ErroAPI, "description": "Distrito não encontrado."},
        422: {"model": ErroAPI, "description": "Resposta, opção ou código de distrito inválido."},
        503: {"model": ErroAPI, "description": "Banco de dados indisponível."},
    },
    tags=["Questionário"],
)
def registrar_questionario(entrada: Annotated[
    QuestionarioEntradaV2,
    Body(openapi_examples={
        "v2": {"summary": "V2 morador", "value": {
            "id_territorial": "355030801", "versao_questionario": 2,
            "vinculo_territorial": "morador_mais_1_ano",
            "respostas": {
                "abastecimento_agua_rede_geral": "sim",
                "esgotamento_sanitario_rede_geral": "nao_sei",
                "destino_lixo_coleta_direta": "sim",
                "existencia_banheiro_exclusivo": "sim",
                "falta_agua_30_dias": "1_2",
                "esgoto_ceu_aberto_30_dias": "nunca",
                "satisfacao_saneamento": "neutro",
                "regularidade_agua": 0, "qualidade_agua_percebida": 10,
                "condicoes_esgotamento": 5,
            }, "comentario": "Relato opcional",
        }},
    }),
]):
    respostas = entrada.respostas.model_dump()
    with cursor() as cur:
        cur.execute(
            "SELECT nome FROM territorio WHERE id_territorial = %s AND nivel = 'distrito'",
            (entrada.id_territorial,),
        )
        distrito = cur.fetchone()
        if distrito is None:
            raise HTTPException(404, "Distrito não encontrado.")

        cur.execute(
            """
            INSERT INTO resposta_questionario
                (id_territorial, respostas, versao_questionario, vinculo_territorial,
                 comentario, pontuacao, nivel_saneamento)
            VALUES (%s, %s, 2, %s, %s, NULL, NULL)
            RETURNING id, id_territorial, respostas, versao_questionario,
                      vinculo_territorial, comentario, criado_em
            """,
            (entrada.id_territorial, Jsonb(respostas),
             entrada.vinculo_territorial.value, entrada.comentario),
        )
        registro = cur.fetchone()

    return {**registro, "nome_territorio": distrito["nome"]}


@router.get(
    "/api/v1/questionario",
    response_model=QuestionarioListaV2,
    summary="Consulta as respostas gravadas do questionário",
    description=(
        "Lista respostas da mais recente para a mais antiga, com filtro territorial e paginacao. "
        "Retorna exclusivamente V2, sem comentarios livres."
    ),
    responses={
        422: {"model": ErroAPI, "description": "Parâmetro inválido."},
        503: {"model": ErroAPI, "description": "Banco de dados indisponível."},
    },
    tags=["Questionário"],
)
def consultar_questionarios(
    id_territorial: Optional[str] = Query(
        None, pattern=r"^[0-9]{9}$", description="Código IBGE (9 dígitos) do distrito."
    ),
    limite: int = Query(50, ge=1, le=200, description="Máximo de registros por página."),
    deslocamento: int = Query(0, ge=0, description="Quantidade de registros a pular."),
    versao_questionario: Annotated[int, Query(ge=2, le=2, description="Somente 2 (padrao).")] = 2,
):
    filtros: list[str] = ["r.versao_questionario = %s"]
    parametros: list = [versao_questionario]
    if id_territorial is not None:
        filtros.append("r.id_territorial = %s")
        parametros.append(id_territorial)
    where = ("WHERE " + " AND ".join(filtros)) if filtros else ""

    with cursor() as cur:
        cur.execute(f"SELECT count(*) AS total FROM resposta_questionario r {where}", tuple(parametros))
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT r.id, r.id_territorial, t.nome AS nome_territorio, r.respostas,
                   r.versao_questionario, r.vinculo_territorial, r.criado_em
            FROM resposta_questionario r
            JOIN territorio t ON t.id_territorial = r.id_territorial
            {where}
            ORDER BY r.criado_em DESC, r.id DESC
            LIMIT %s OFFSET %s
            """,
            (*parametros, limite, deslocamento),
        )
        itens = cur.fetchall()

    return {"total": total, "limite": limite, "deslocamento": deslocamento, "itens": itens}
