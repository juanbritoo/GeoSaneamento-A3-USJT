from typing import Optional

from fastapi import APIRouter, HTTPException, Query
from psycopg.types.json import Jsonb

from ..classificacao import NivelSaneamento, calcular_pontuacao, classificar
from ..db import cursor
from ..schemas import ErroAPI, QuestionarioEntrada, QuestionarioLista, QuestionarioResposta

router = APIRouter()


@router.post(
    "/api/v1/questionario",
    response_model=QuestionarioResposta,
    status_code=201,
    summary="Registra as respostas do questionário de um distrito",
    description=(
        "Associa as respostas ao distrito informado, calcula a pontuação (0 a 100) e o "
        "nível de saneamento (critico, precario, regular ou adequado) e grava tudo no banco. "
        "O critério de classificação está em app/classificacao.py."
    ),
    responses={
        404: {"model": ErroAPI, "description": "Distrito não encontrado."},
        422: {"model": ErroAPI, "description": "Resposta, opção ou código de distrito inválido."},
        503: {"model": ErroAPI, "description": "Banco de dados indisponível."},
    },
    tags=["Questionário"],
)
def registrar_questionario(entrada: QuestionarioEntrada):
    respostas = entrada.respostas.model_dump()
    pontuacao = calcular_pontuacao(respostas)
    nivel = classificar(pontuacao)

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
            INSERT INTO resposta_questionario (id_territorial, respostas, pontuacao, nivel_saneamento)
            VALUES (%s, %s, %s, %s)
            RETURNING id, id_territorial, respostas, pontuacao::float8 AS pontuacao,
                      nivel_saneamento, criado_em
            """,
            (entrada.id_territorial, Jsonb(respostas), pontuacao, nivel),
        )
        registro = cur.fetchone()

    return {**registro, "nome_territorio": distrito["nome"]}


@router.get(
    "/api/v1/questionario",
    response_model=QuestionarioLista,
    summary="Consulta as respostas gravadas do questionário",
    description=(
        "Lista as respostas já registradas, da mais recente para a mais antiga. "
        "Aceita filtro por distrito e por nível de saneamento, com paginação."
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
    nivel_saneamento: Optional[NivelSaneamento] = Query(None, description="Filtra pelo nível classificado."),
    limite: int = Query(50, ge=1, le=200, description="Máximo de registros por página."),
    deslocamento: int = Query(0, ge=0, description="Quantidade de registros a pular."),
):
    # O contrato existente representa apenas V1 (pontuacao e respostas textuais).
    filtros: list[str] = ["r.versao_questionario = 1"]
    parametros: list = []
    if id_territorial is not None:
        filtros.append("r.id_territorial = %s")
        parametros.append(id_territorial)
    if nivel_saneamento is not None:
        filtros.append("r.nivel_saneamento = %s")
        parametros.append(nivel_saneamento)
    where = ("WHERE " + " AND ".join(filtros)) if filtros else ""

    with cursor() as cur:
        cur.execute(f"SELECT count(*) AS total FROM resposta_questionario r {where}", tuple(parametros))
        total = cur.fetchone()["total"]

        cur.execute(
            f"""
            SELECT r.id, r.id_territorial, t.nome AS nome_territorio, r.respostas,
                   r.pontuacao::float8 AS pontuacao, r.nivel_saneamento, r.criado_em
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
