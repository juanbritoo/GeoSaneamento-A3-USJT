#!/usr/bin/env python3
"""Inserir o lote demonstrativo V2 no PostgreSQL local existente da aplicação."""
import argparse
import json
import os
import random
import sys
from datetime import date, datetime, time, timedelta
from pathlib import Path
from zoneinfo import ZoneInfo

import psycopg
from psycopg.conninfo import conninfo_to_dict
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.indicadores_participativos import PRINCIPAIS
from app.schemas import QuestionarioEntradaV2
from app.validacao_questionario import CAMPOS_DOMICILIARES

FUSO = ZoneInfo('America/Sao_Paulo')
ID_MIN, ID_MAX = -10006999, -10000000
SEMENTE = 20261126
DATA_LOTE = date(2026, 11, 26)
# ID, nome, cenário planejado, denominadores e quantidades de "sim" do lote original.
CONFIG = (
    ('355030862', 'Pinheiros', 'sem_alerta', (100, 100, 100, 100), (92, 85, 75, 90)),
    ('355030853', 'Mooca', 'amostra_insuficiente', (8, 8, 8, 8), (7, 6, 6, 7)),
    ('355030815', 'Campo Belo', 'nao_comparavel', (50, 50, 50, 50), (30, 30, 28, 35)),
    ('355030837', 'Itaquera', 'possivel_divergencia', (100, 100, 100, 100), (82, 95, 75, 90)),
    ('355030819', 'Capão Redondo', 'divergencia_elevada', (100, 30, 0, 60), (72, 27, 0, 54)),
    ('355030878', 'Sé', 'dados_simulados', (100, 100, 100, 100), (60, 60, 65, 90)),
    ('355030890', 'Vila Mariana', 'sem_participacao', (0, 0, 0, 0), (0, 0, 0, 0)),
)
COMENTARIOS = (
    'A pressão da água diminui durante a noite.',
    'O abastecimento costuma ser interrompido nos finais de semana.',
    'A coleta de resíduos acontece regularmente.',
    'Existem pontos de esgoto exposto próximos às residências.',
    'O serviço de saneamento atende bem às necessidades da região.',
)


def conexao_local():
    url = os.environ.get('DATABASE_URL')
    if not url:
        raise ValueError('DATABASE_URL ausente. Execute no container api atual.')
    parametros = conninfo_to_dict(url)
    if (parametros.get('host') not in ('db', 'localhost', '127.0.0.1', '::1')
            or set(parametros) - {'host', 'port', 'dbname', 'user', 'password'}
            or any(os.getenv(k) for k in ('PGHOSTADDR', 'PGSERVICE', 'PGSERVICEFILE', 'PGOPTIONS'))):
        raise ValueError('Somente a conexão PostgreSQL local existente é permitida.')
    return parametros


def gerar():
    registros = []
    ancora = DATA_LOTE
    inicio = max(ancora - timedelta(days=29), date(ancora.year, 1, 1))
    dias = (ancora - inicio).days + 1
    for indice, (id_territorial, nome, cenario, denominadores, totais_sim) in enumerate(CONFIG):
        maximo = max(denominadores)
        moradores = maximo + (4 if maximo == 8 else 10 if maximo == 50 else 12) if maximo else 0
        outros = (4 if maximo == 8 else 8) if maximo else 0
        total = moradores + outros
        rng = random.Random(SEMENTE + indice)
        colunas = {}
        for campo, validas, sim in zip(PRINCIPAIS, denominadores, totais_sim):
            valores = ['sim'] * sim + ['nao'] * (validas - sim) + ['nao_sei'] * (moradores - validas)
            rng.shuffle(valores)
            colunas[campo] = valores
        comentarios = set(rng.sample(range(total), round(total / 4)))
        for j in range(total):
            morador = j < moradores
            vinculo = ('morador_menos_1_ano' if j % 4 == 0 else 'morador_mais_1_ano') if morador else ('trabalha_estuda' if j % 2 == 0 else 'sem_vinculo_frequente')
            respostas = {campo: colunas[campo][j] if morador else None for campo in PRINCIPAIS}
            respostas.update(falta_agua_30_dias=rng.choice(('nenhum', '1_2', '3_7', '8_15', 'mais_15', 'nao_sei')),
                esgoto_ceu_aberto_30_dias=rng.choice(('nunca', 'uma_duas_vezes', 'semanalmente', 'diariamente', 'nao_sei')),
                satisfacao_saneamento=rng.choice(('muito_satisfeito', 'satisfeito', 'neutro', 'insatisfeito', 'muito_insatisfeito', 'nao_sei')),
                regularidade_agua=(*range(11), None)[j % 12], qualidade_agua_percebida=(*range(11), None)[(j + 5) % 12],
                condicoes_esgotamento=(*range(11), None)[(j + 10) % 12])
            if not morador:
                respostas.update({campo: None for campo in CAMPOS_DOMICILIARES})
            payload = QuestionarioEntradaV2.model_validate(dict(id_territorial=id_territorial, versao_questionario=2,
                vinculo_territorial=vinculo, respostas=respostas,
                comentario='[DEMONSTRAÇÃO FICTÍCIA] ' + rng.choice(COMENTARIOS) if j in comentarios else None)).model_dump(mode='json')
            registros.append(dict(id=ID_MAX - indice * 1000 - j, **payload, pontuacao=None, nivel_saneamento=None,
                criado_em=datetime.combine(ancora - timedelta(days=j % dias), time(), FUSO)))
    return registros


def executar(aplicar):
    registros = gerar()
    por_id = {r['id']: r for r in registros}
    with psycopg.connect(**conexao_local(), connect_timeout=5, row_factory=dict_row) as conn:
        with conn.cursor() as cur:
            if not aplicar:
                cur.execute('SET TRANSACTION READ ONLY')
            cur.execute("SET LOCAL lock_timeout='5s'")
            if aplicar:
                cur.execute('SELECT pg_advisory_xact_lock(20261126, 10)')
            for codigo, nome, *_ in CONFIG:
                cur.execute("SELECT 1 FROM territorio WHERE id_territorial=%s AND nome=%s AND nivel='distrito' AND id_municipio='3550308'", (codigo, nome))
                if not cur.fetchone():
                    raise ValueError(f'Distrito não cadastrado: {nome} ({codigo}). Nenhum território será criado.')
            cur.execute("""SELECT id,id_territorial,versao_questionario,vinculo_territorial,respostas,comentario,
                pontuacao,nivel_saneamento,criado_em FROM resposta_questionario WHERE id BETWEEN %s AND %s""", (ID_MIN, ID_MAX))
            existentes = cur.fetchall()
            for r in existentes:
                if r != por_id.get(r['id']):
                    raise ValueError('ID reservado ocupado por conteúdo diferente. Operação cancelada sem sobrescrever dados.')
            ids_existentes = {r['id'] for r in existentes}
            novos = [r for r in registros if r['id'] not in ids_existentes]
            if aplicar:
                for r in novos:
                    cur.execute("""INSERT INTO resposta_questionario (id,id_territorial,versao_questionario,vinculo_territorial,
                        respostas,comentario,pontuacao,nivel_saneamento,criado_em) VALUES (%s,%s,2,%s,%s,%s,NULL,NULL,%s)""",
                        (r['id'], r['id_territorial'], r['vinculo_territorial'], Jsonb(r['respostas']), r['comentario'], r['criado_em']))
    return dict(modo='apply' if aplicar else 'dry-run', lote_demonstrativo=SEMENTE,
                planejados=len(registros), existentes=len(existentes), novos=len(novos),
                aviso='Dados fictícios identificados pelos IDs reservados. Os status dependem das referências e participações existentes; nenhuma fonte será alterada.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modo = parser.add_mutually_exclusive_group()
    modo.add_argument('--dry-run', action='store_true', help='Padrão: planejar sem gravar.')
    modo.add_argument('--apply', action='store_true', help='Inserir no PostgreSQL local atual.')
    args = parser.parse_args()
    try:
        resultado = executar(args.apply)
    except ValueError as erro:
        parser.exit(2, f'Operação cancelada: {erro}\n')
    except psycopg.Error:
        parser.exit(2, 'Falha de banco; transação revertida. Nenhum registro existente foi sobrescrito.\n')
    print(json.dumps(resultado, ensure_ascii=False, indent=2))


if __name__ == '__main__':
    main()
