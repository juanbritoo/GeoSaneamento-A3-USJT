from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from ..db import cursor
from ..indicadores_participativos import agregar_indicadores, agregar_resumo
from ..schemas import ErroAPI, IndicadoresParticipativosResposta, ResumoTerritorialParticipativo

router = APIRouter(tags=['Indicadores participativos'])


def validar_periodo(
    data_inicio: Annotated[date | None, Query(description='Data inicial inclusiva (AAAA-MM-DD), America/Sao_Paulo.')] = None,
    data_fim: Annotated[date | None, Query(description='Data final inclusiva (AAAA-MM-DD), America/Sao_Paulo.')] = None,
):
    if data_inicio and data_fim and data_inicio > data_fim:
        raise HTTPException(422, 'data_inicio deve ser anterior ou igual a data_fim.')
    return {'data_inicio': data_inicio, 'data_fim': data_fim}


@router.get(
    '/api/v1/questionario/indicadores',
    response_model=IndicadoresParticipativosResposta,
    summary='Indicadores participativos V2 de um distrito',
    description='Agrega questionarios, nao pessoas unicas. Denominadores independentes excluem desconhecidos e nao aplicaveis. Sem comentarios livres.',
    responses={404: {'model': ErroAPI, 'description': 'Distrito inexistente.'},
               422: {'description': 'Identificador ou periodo invalido.'},
               503: {'model': ErroAPI, 'description': 'Banco indisponivel.'}},
)
def consultar_indicadores(
    id_territorial: Annotated[str, Query(pattern=r'^[0-9]{9}$')],
    periodo: Annotated[dict, Depends(validar_periodo)],
):
    with cursor() as cur:
        cur.execute("SELECT id_territorial, nome FROM territorio WHERE id_territorial = %s AND nivel = 'distrito'", (id_territorial,))
        territorio = cur.fetchone()
        if territorio is None:
            raise HTTPException(404, 'Distrito nao encontrado.')
        resultado = agregar_indicadores(cur, id_territorial, **periodo)
    return {'territorio': territorio, 'periodo': periodo, **resultado}


@router.get(
    '/api/v1/questionario/resumo-territorial',
    response_model=ResumoTerritorialParticipativo,
    summary='Contadores V2 de todos os distritos, inclusive sem respostas',
    description='Contagem de questionarios, sem deduplicacao de pessoas e sem comentarios livres.',
    responses={422: {'description': 'Periodo invalido.'},
               503: {'model': ErroAPI, 'description': 'Banco indisponivel.'}},
)
def consultar_resumo(periodo: Annotated[dict, Depends(validar_periodo)]):
    with cursor() as cur:
        distritos = agregar_resumo(cur, **periodo)
    return {'periodo': periodo, 'distritos': distritos}
