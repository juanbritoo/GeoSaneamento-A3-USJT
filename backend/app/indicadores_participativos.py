"""Agregacoes de questionarios V2; nenhuma resposta individual deixa o banco."""
from psycopg.types.json import Jsonb

PRINCIPAIS = (
    'abastecimento_agua_rede_geral', 'esgotamento_sanitario_rede_geral',
    'destino_lixo_coleta_direta', 'existencia_banheiro_exclusivo',
)
NOTAS = ('regularidade_agua', 'qualidade_agua_percebida', 'condicoes_esgotamento')
DISTRIBUICOES = (
    ('falta_agua_30_dias', True, 'COM_FALTA_AGUA',
     ('nenhum', '1_2', '3_7', '8_15', 'mais_15'), ('1_2', '3_7', '8_15', 'mais_15')),
    ('esgoto_ceu_aberto_30_dias', False, 'OBSERVARAM_ESGOTO_EXPOSTO',
     ('nunca', 'uma_duas_vezes', 'semanalmente', 'diariamente'),
     ('uma_duas_vezes', 'semanalmente', 'diariamente')),
    ('satisfacao_saneamento', False, 'SATISFEITOS',
     ('muito_satisfeito', 'satisfeito', 'neutro', 'insatisfeito', 'muito_insatisfeito'),
     ('muito_satisfeito', 'satisfeito')),
)

CONTADORES_SQL = """
    COUNT(b.id) AS total_questionarios,
    COUNT(b.id) FILTER (WHERE b.morador) AS total_moradores,
    COUNT(b.id) FILTER (WHERE b.nao_morador) AS total_nao_moradores,
    COUNT(b.id) FILTER (WHERE NOT (b.morador OR b.nao_morador)) AS total_vinculo_nao_informado,
    COUNT(b.id) FILTER (WHERE b.tem_comentario) AS total_comentarios
"""


def base_sql(data_inicio, data_fim, id_territorial=None):
    filtros = ['r.versao_questionario = 2']
    parametros = []
    if id_territorial is not None:
        filtros.append('r.id_territorial = %s')
        parametros.append(id_territorial)
    if data_inicio is not None:
        filtros.append("r.criado_em >= (%s::date::timestamp AT TIME ZONE 'America/Sao_Paulo')")
        parametros.append(data_inicio)
    if data_fim is not None:
        filtros.append("r.criado_em < ((%s::date + INTERVAL '1 day') AT TIME ZONE 'America/Sao_Paulo')")
        parametros.append(data_fim)
    return """
        SELECT r.id, r.id_territorial, r.respostas,
            COALESCE(r.vinculo_territorial IN ('morador_mais_1_ano', 'morador_menos_1_ano'), FALSE) AS morador,
            COALESCE(r.vinculo_territorial IN ('trabalha_estuda', 'sem_vinculo_frequente'), FALSE) AS nao_morador,
            COALESCE(r.comentario ~ '[^[:space:]]', FALSE) AS tem_comentario
        FROM resposta_questionario r WHERE
    """ + ' AND '.join(filtros), parametros


def agregar_indicadores(cur, id_territorial, data_inicio=None, data_fim=None):
    base, parametros = base_sql(data_inicio, data_fim, id_territorial)
    categorias = [
        dict(campo=campo, domiciliar=domiciliar, indicador=indicador,
             codigo=codigo, favoravel=codigo in favoraveis, ordem=ordem)
        for campo, domiciliar, indicador, codigos, favoraveis in DISTRIBUICOES
        for ordem, codigo in enumerate((*codigos, 'nao_sei'))
    ]
    cur.execute("""
        WITH base AS (""" + base + """),
        contadores AS (SELECT """ + CONTADORES_SQL + """ FROM base b),
        principais_contagens AS (
            SELECT c.campo,
                COUNT(b.id) FILTER (WHERE b.respostas->>c.campo = 'sim') AS total_sim,
                COUNT(b.id) FILTER (WHERE b.respostas->>c.campo = 'nao') AS total_nao,
                COUNT(b.id) FILTER (WHERE b.respostas->>c.campo = 'nao_sei') AS total_nao_sei
            FROM unnest(%s::text[]) AS c(campo)
            LEFT JOIN base b ON b.morador
            GROUP BY c.campo
        ), principais AS (
            SELECT upper(campo) AS codigo,
                ROUND(100.0 * total_sim / NULLIF(total_sim + total_nao, 0), 2) AS valor,
                total_sim, total_nao, total_nao_sei,
                total_sim + total_nao AS respostas_validas
            FROM principais_contagens
        ), notas AS (
            SELECT c.campo, n.nota
            FROM unnest(%s::text[], %s::boolean[]) AS c(campo, domiciliar)
            LEFT JOIN base b ON (b.morador OR b.nao_morador) AND (NOT c.domiciliar OR b.morador)
            CROSS JOIN LATERAL (
                SELECT CASE WHEN jsonb_typeof(b.respostas->c.campo) = 'number'
                            THEN (b.respostas->>c.campo)::numeric END AS nota
            ) n
        ), medias AS (
            SELECT campo,
                ROUND(AVG(nota) FILTER (WHERE nota BETWEEN 0 AND 10 AND nota = trunc(nota)), 2) AS valor,
                COUNT(nota) FILTER (WHERE nota BETWEEN 0 AND 10 AND nota = trunc(nota)) AS respostas_validas
            FROM notas GROUP BY campo
        ), categorias_contagens AS (
            SELECT c.campo, c.codigo, c.indicador, c.favoravel, c.ordem, COUNT(b.id) AS total
            FROM jsonb_to_recordset(%s::jsonb) AS c(
                campo text, codigo text, domiciliar boolean, indicador text, favoravel boolean, ordem integer)
            LEFT JOIN base b ON (b.morador OR b.nao_morador)
                AND (NOT c.domiciliar OR b.morador) AND b.respostas->>c.campo = c.codigo
            GROUP BY c.campo, c.codigo, c.indicador, c.favoravel, c.ordem
        ), categorias_totais AS (
            SELECT *,
                SUM(total) FILTER (WHERE codigo <> 'nao_sei') OVER (PARTITION BY campo) AS respostas_validas,
                SUM(total) FILTER (WHERE codigo = 'nao_sei') OVER (PARTITION BY campo) AS total_nao_sei
            FROM categorias_contagens
        ), distribuicoes AS (
            SELECT campo, MAX(respostas_validas) AS respostas_validas, MAX(total_nao_sei) AS total_nao_sei,
                jsonb_agg(jsonb_build_object('codigo', codigo, 'total', total,
                    'percentual', ROUND(100.0 * total / NULLIF(respostas_validas, 0), 2)) ORDER BY ordem)
                    FILTER (WHERE codigo <> 'nao_sei') AS categorias
            FROM categorias_totais GROUP BY campo
        ), percentuais AS (
            SELECT indicador AS codigo,
                SUM(total) FILTER (WHERE favoravel) AS total_favoravel,
                MAX(respostas_validas) AS respostas_validas,
                ROUND(100.0 * SUM(total) FILTER (WHERE favoravel) /
                    NULLIF(MAX(respostas_validas), 0), 2) AS valor
            FROM categorias_totais GROUP BY indicador
        )
        SELECT (SELECT to_jsonb(c) FROM contadores c) AS contadores,
            (SELECT jsonb_agg(p ORDER BY codigo) FROM principais p) AS principais,
            jsonb_build_object(
                'medias', (SELECT jsonb_agg(m ORDER BY campo) FROM medias m),
                'distribuicoes', (SELECT jsonb_agg(d ORDER BY campo) FROM distribuicoes d),
                'percentuais', (SELECT jsonb_agg(p ORDER BY codigo) FROM percentuais p)
            ) AS complementares
    """, (*parametros, list(PRINCIPAIS), list(NOTAS), [True, True, False], Jsonb(categorias)))
    return cur.fetchone()


def agregar_resumo(cur, data_inicio=None, data_fim=None):
    base, parametros = base_sql(data_inicio, data_fim)
    cur.execute("""
        WITH base AS (""" + base + """)
        SELECT t.id_territorial, t.nome, """ + CONTADORES_SQL + """
        FROM territorio t LEFT JOIN base b ON b.id_territorial = t.id_territorial
        WHERE t.nivel = 'distrito'
        GROUP BY t.id_territorial, t.nome
        ORDER BY t.nome, t.id_territorial
    """, parametros)
    return [
        {'territorio': {'id_territorial': row.pop('id_territorial'), 'nome': row.pop('nome')},
         'contadores': row}
        for row in cur.fetchall()
    ]
