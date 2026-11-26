from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query

from ..correlacao import analisar
from ..db import cursor
from ..schemas import CorrelacaoResposta, ErroAPI
from .indicadores_participativos import validar_periodo

router = APIRouter(tags=['Analise comparativa territorial'])


@router.get('/api/v1/correlacao', response_model=CorrelacaoResposta,
    summary='Comparacao descritiva distrital entre indicadores oficiais e participativos V2',
    description='Sem substituicao municipal. Simulacoes nao geram alertas reais. Amostra minima individual de 30 respostas validas.',
    responses={404: {'model': ErroAPI, 'description': 'Distrito inexistente.'},
               422: {'description': 'Parametros invalidos.'},
               503: {'model': ErroAPI, 'description': 'Banco indisponivel.'}})
def consultar_correlacao(
    periodo: Annotated[dict, Depends(validar_periodo)],
    id_territorial: Annotated[str | None, Query(pattern=r'^[0-9]{9}$')] = None,
    periodo_oficial: Annotated[str | None, Query(min_length=1, max_length=50, pattern=r'^\S(?:.*\S)?$',
        description='Referencia exata armazenada; omitida seleciona o ano mais recente por codigo, priorizando fonte oficial nao simulada.')] = None,
):
    with cursor() as cur:
        distritos = analisar(cur, id_territorial=id_territorial, periodo_oficial=periodo_oficial, **periodo)
    if id_territorial is not None and not distritos:
        raise HTTPException(404, 'Distrito nao encontrado.')
    return {'periodo': periodo, 'periodo_oficial': periodo_oficial, 'distritos': distritos}
