"""Comparacao descritiva; amostras voluntarias nao comprovam irregularidades."""
from decimal import Decimal, ROUND_HALF_UP

from .indicadores_participativos import PRINCIPAIS, base_sql

MINIMO_RESPOSTAS_VALIDAS = 30
LIMITE_POSSIVEL_PP = Decimal('10')
LIMITE_ELEVADA_PP = Decimal('20')
METODOLOGIAS_V2 = {campo.upper(): f'domicilios_ocupados:{campo}:v2' for campo in PRINCIPAIS}
UNIDADES_PERCENTUAIS = {'%', 'Percentual', 'percentual'}


def arredondar(valor):
    return Decimal(str(valor)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP)


def classificar(diferenca):
    if diferenca >= LIMITE_ELEVADA_PP:
        return 'divergencia_elevada'
    if diferenca >= LIMITE_POSSIVEL_PP:
        return 'possivel_divergencia'
    return 'sem_alerta'


def carregar_participativos(cur, id_territorial=None, data_inicio=None, data_fim=None):
    base, params = base_sql(data_inicio, data_fim, id_territorial)
    filtro = 'AND t.id_territorial = %s' if id_territorial is not None else ''
    cur.execute('''
        WITH base AS (''' + base + '''), contagens AS (
            SELECT t.id_territorial, t.nome AS nome_territorio, c.campo,
                COUNT(b.id) AS total_questionarios,
                COUNT(b.id) FILTER (WHERE b.morador AND b.respostas->>c.campo = 'sim') AS sim,
                COUNT(b.id) FILTER (WHERE b.morador AND b.respostas->>c.campo = 'nao') AS nao,
                MIN((r.criado_em AT TIME ZONE 'America/Sao_Paulo')::date)
                    FILTER (WHERE b.morador AND b.respostas->>c.campo IN ('sim','nao')) AS primeira_resposta,
                MAX((r.criado_em AT TIME ZONE 'America/Sao_Paulo')::date)
                    FILTER (WHERE b.morador AND b.respostas->>c.campo IN ('sim','nao')) AS ultima_resposta
            FROM territorio t CROSS JOIN unnest(%s::text[]) c(campo)
            LEFT JOIN base b ON b.id_territorial = t.id_territorial
            LEFT JOIN resposta_questionario r ON r.id = b.id
            WHERE t.nivel = 'distrito' ''' + filtro + '''
            GROUP BY t.id_territorial, t.nome, c.campo
        ) SELECT *, upper(campo) AS codigo, sim + nao AS respostas_validas,
            ROUND(100.0 * sim / NULLIF(sim + nao, 0), 2) AS valor_participativo
        FROM contagens ORDER BY nome_territorio, id_territorial, codigo
    ''', (*params, list(PRINCIPAIS), *((id_territorial,) if id_territorial else ())))
    return cur.fetchall()


def carregar_referencias(cur, ids, periodo_oficial=None):
    filtro = 'AND v.periodo = %s' if periodo_oficial is not None else ''
    cur.execute('''
        SELECT v.id_territorial, v.indicador AS codigo, v.valor, v.unidade,
            i.unidade AS unidade_catalogo, v.fonte, v.periodo, v.is_mock,
            v.id_fonte, f.classificacao AS classificacao_fonte, f.procedencia, v.dimensoes
        FROM valor_indicador v JOIN indicador i ON i.codigo = v.indicador
        JOIN fonte_dado f ON f.id_fonte = v.id_fonte
        JOIN territorio t ON t.id_territorial = v.id_territorial AND t.nivel = 'distrito'
        WHERE v.id_territorial = ANY(%s) AND v.indicador = ANY(%s) ''' + filtro + '''
        ORDER BY v.id_territorial, v.indicador, v.periodo, v.fonte
    ''', (ids, list(METODOLOGIAS_V2), *((periodo_oficial,) if periodo_oficial is not None else ())))
    return cur.fetchall()


def selecionar_referencia(candidatos):
    if not candidatos:
        return None, 'Dado distrital ausente para o codigo e periodo solicitados.'
    oficiais = [c for c in candidatos if c['classificacao_fonte'] == 'oficial' and not c['is_mock']]
    candidatos = oficiais or candidatos
    anos = [c for c in candidatos if len(c['periodo']) == 4 and c['periodo'].isascii() and c['periodo'].isdigit()]
    if len(anos) == len(candidatos):
        ultimo = max(c['periodo'] for c in anos)
        candidatos = [c for c in anos if c['periodo'] == ultimo]
    if len(candidatos) != 1:
        return None, 'Referencias ambiguas: multiplas fontes ou periodos sem ordenacao anual.'
    return candidatos[0], None


def comparar(participativo, candidatos):
    ref, motivo = selecionar_referencia(candidatos)
    item = {k: participativo[k] for k in ('codigo', 'valor_participativo', 'respostas_validas', 'primeira_resposta', 'ultima_resposta')}
    item.update(valor_oficial=None, unidade='%', unidade_oficial=None, fonte=None, periodo=None,
                procedencia=None, classificacao_fonte=None, id_fonte=None, is_mock=None,
                divergencia_pp=None, divergencia_absoluta_pp=None, simulacao=None,
                status='nao_comparavel', motivo=motivo)
    if ref:
        item.update(valor_oficial=ref['valor'] if ref['valor'] is not None and ref['valor'].is_finite() else None,
                    unidade_oficial=ref['unidade'], **{k: ref[k] for k in
                    ('fonte','periodo','procedencia','classificacao_fonte','id_fonte','is_mock')})
        dimensoes = ref['dimensoes'] if isinstance(ref['dimensoes'], dict) else {}
        if ref['unidade'] not in UNIDADES_PERCENTUAIS or ref['unidade_catalogo'] not in UNIDADES_PERCENTUAIS:
            motivo = 'Unidade incompativel com percentual.'
        elif dimensoes != {'metodologia_comparavel_v2': METODOLOGIAS_V2[item['codigo']]}:
            motivo = 'Definicao metodologica nao validada ou dimensoes adicionais incompatíveis.'
        elif item['valor_oficial'] is None or not 0 <= item['valor_oficial'] <= 100:
            motivo = 'Valor de referencia ausente ou fora da faixa percentual.'
        elif not (len(ref['periodo']) == 4 and ref['periodo'].isascii() and ref['periodo'].isdigit()
                  and participativo['primeira_resposta'] and participativo['ultima_resposta']
                  and participativo['primeira_resposta'].year == participativo['ultima_resposta'].year == int(ref['periodo'])):
            motivo = 'Periodo oficial nao anual ou anos das respostas validas incompatíveis com a referencia.'
        else:
            motivo = None
    if participativo['total_questionarios'] == 0:
        item.update(status='sem_dados', motivo='Sem questionarios V2 no periodo selecionado.')
    elif item['respostas_validas'] < MINIMO_RESPOSTAS_VALIDAS:
        item.update(status='amostra_insuficiente', motivo=f'Menos de {MINIMO_RESPOSTAS_VALIDAS} respostas validas neste indicador.')
    elif motivo:
        item['motivo'] = motivo
    else:
        delta = arredondar(ref['valor'] - Decimal(str(item['valor_participativo'])))
        absoluto = abs(delta)
        if ref['is_mock'] or ref['classificacao_fonte'] != 'oficial' or not ref['procedencia'].strip():
            item.update(motivo='Referencia simulada ou de procedencia nao oficial; excluida dos alertas reais.',
                        simulacao={'divergencia_pp': delta, 'divergencia_absoluta_pp': absoluto,
                                   'status_simulado': classificar(absoluto)})
        else:
            item.update(status=classificar(absoluto), motivo=None,
                        divergencia_pp=delta, divergencia_absoluta_pp=absoluto)
    return item


def resumir(indicadores, total):
    elegiveis = [i for i in indicadores if i['divergencia_absoluta_pp'] is not None]
    critico = max(elegiveis, key=lambda i: i['divergencia_absoluta_pp'], default=None)
    status = (critico['status'] if critico else 'sem_dados' if total == 0 else
              'amostra_insuficiente' if all(i['status'] == 'amostra_insuficiente' for i in indicadores) else 'nao_comparavel')
    return dict(indicadores_comparados=len(elegiveis),
                indicadores_divergentes=sum(i['divergencia_absoluta_pp'] >= LIMITE_POSSIVEL_PP for i in elegiveis),
                divergencia_media_absoluta_pp=arredondar(sum(i['divergencia_absoluta_pp'] for i in elegiveis) / len(elegiveis)) if elegiveis else None,
                maior_divergencia_absoluta_pp=critico['divergencia_absoluta_pp'] if critico else None,
                indicador_critico=critico['codigo'] if critico else None,
                status=status, exibir_alerta=status in ('possivel_divergencia','divergencia_elevada'))


def analisar(cur, id_territorial=None, data_inicio=None, data_fim=None, periodo_oficial=None):
    participativos = carregar_participativos(cur, id_territorial, data_inicio, data_fim)
    ids = list(dict.fromkeys(p['id_territorial'] for p in participativos))
    referencias = carregar_referencias(cur, ids, periodo_oficial) if ids else []
    por_chave = {}
    for ref in referencias:
        por_chave.setdefault((ref['id_territorial'], ref['codigo']), []).append(ref)
    distritos = {}
    for p in participativos:
        distrito = distritos.setdefault(p['id_territorial'], dict(id_territorial=p['id_territorial'],
            nome_territorio=p['nome_territorio'], total_questionarios=p['total_questionarios'], indicadores=[]))
        distrito['indicadores'].append(comparar(p, por_chave.get((p['id_territorial'], p['codigo']), [])))
    for distrito in distritos.values():
        distrito['resumo'] = resumir(distrito['indicadores'], distrito['total_questionarios'])
    return list(distritos.values())
