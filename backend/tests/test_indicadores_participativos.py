"""SQL e endpoints reais com fixtures transacionais em PostgreSQL/PostGIS isolado."""
import asyncio
import json
import os
import unittest
from contextlib import contextmanager
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.indicadores_participativos import PRINCIPAIS
from app.routers import indicadores_participativos as router
from seed.init_db import read_schema
from test_questionario_v2 import request


class IndicadoresParticipativosTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg.connect(os.environ['TEST_DATABASE_URL'])
        self.addCleanup(self.conn.close)
        self.addCleanup(self.conn.rollback)
        self.conn.execute('CREATE SCHEMA indicadores_test')
        self.conn.execute('SET LOCAL search_path TO indicadores_test, public')
        self.conn.execute(read_schema(), prepare=False)
        self.conn.execute("""INSERT INTO territorio(id_territorial,nome,fonte,periodo)
            VALUES ('355030801','Distrito A','teste','2022'),
                   ('355030802','Distrito B','teste','2022')""")

        @contextmanager
        def test_cursor():
            with self.conn.cursor(row_factory=dict_row) as cur:
                yield cur

        patcher = patch.object(router, 'cursor', test_cursor)
        patcher.start()
        self.addCleanup(patcher.stop)

    def inserir(self, respostas=None, vinculo='morador_mais_1_ano', versao=2,
                territorio='355030801', data='2026-11-24T12:00:00-03:00', comentario=None):
        self.conn.execute('''INSERT INTO resposta_questionario
            (id_territorial,respostas,vinculo_territorial,versao_questionario,
             criado_em,comentario,pontuacao,nivel_saneamento)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)''',
            (territorio,Jsonb(respostas or {}),vinculo,versao,data,comentario,
             50 if versao == 1 else None,'precario' if versao == 1 else None))

    def get(self, query='id_territorial=355030801', resumo=False, status=200):
        path='/api/v1/questionario/' + ('resumo-territorial' if resumo else 'indicadores')
        actual, body=asyncio.run(request('GET',query=query,path=path))
        self.assertEqual(status,actual,body)
        return body

    def test_cenario_72_e_denominadores_independentes(self):
        for i in range(120):
            self.inserir({
                PRINCIPAIS[0]: 'sim' if i < 72 else 'nao' if i < 100 else 'nao_sei',
                PRINCIPAIS[1]: 'sim' if i < 30 else 'nao' if i < 100 else None,
                PRINCIPAIS[2]: 'sim' if i == 0 else 'nao_sei',
                PRINCIPAIS[3]: None,
            })
        self.inserir(dict.fromkeys(PRINCIPAIS,'sim'),versao=1)
        for vinculo in ('trabalha_estuda','sem_vinculo_frequente'):
            self.inserir(dict.fromkeys(PRINCIPAIS,'sim'),vinculo=vinculo)
        self.inserir(dict.fromkeys(PRINCIPAIS,'nao'),territorio='355030802')
        result=self.get()
        indicadores={p['codigo']:p for p in result['principais']}
        agua=indicadores[PRINCIPAIS[0].upper()]
        self.assertEqual((72,28,20,100,72.0,'%'),tuple(agua[k] for k in
            ('total_sim','total_nao','total_nao_sei','respostas_validas','valor','unidade')))
        self.assertEqual(30,indicadores[PRINCIPAIS[1].upper()]['valor'])
        self.assertEqual(100,indicadores[PRINCIPAIS[2].upper()]['valor'])
        self.assertIsNone(indicadores[PRINCIPAIS[3].upper()]['valor'])
        self.assertEqual(122,result['contadores']['total_questionarios'])
        self.assertEqual(120,result['contadores']['total_moradores'])
        self.assertEqual(2,result['contadores']['total_nao_moradores'])
        self.assertEqual('questionarios',result['unidade_contagem'])

    def test_medias_distribuicoes_e_percentuais(self):
        self.inserir({'regularidade_agua':0,'qualidade_agua_percebida':10,'condicoes_esgotamento':0,
                      'falta_agua_30_dias':'nenhum','esgoto_ceu_aberto_30_dias':'nunca',
                      'satisfacao_saneamento':'satisfeito'},comentario='CONTEUDO_PRIVADO')
        self.inserir({'regularidade_agua':10,'qualidade_agua_percebida':None,'condicoes_esgotamento':10,
                      'falta_agua_30_dias':'1_2','esgoto_ceu_aberto_30_dias':'diariamente',
                      'satisfacao_saneamento':'muito_satisfeito'},vinculo='morador_menos_1_ano',comentario=' \t\n ')
        self.inserir({'regularidade_agua':None,'qualidade_agua_percebida':None,'condicoes_esgotamento':None,
                      'falta_agua_30_dias':'nao_sei','esgoto_ceu_aberto_30_dias':'nao_sei',
                      'satisfacao_saneamento':'nao_sei'})
        self.inserir({'regularidade_agua':10,'qualidade_agua_percebida':0,'condicoes_esgotamento':10,
                      'falta_agua_30_dias':'mais_15','esgoto_ceu_aberto_30_dias':'semanalmente',
                      'satisfacao_saneamento':'insatisfeito'},vinculo='trabalha_estuda')
        result=self.get()
        medias={m['campo']:m for m in result['complementares']['medias']}
        self.assertEqual((5,2),(medias['regularidade_agua']['valor'],medias['regularidade_agua']['respostas_validas']))
        self.assertEqual((10,1),(medias['qualidade_agua_percebida']['valor'],medias['qualidade_agua_percebida']['respostas_validas']))
        self.assertEqual((6.67,3),(medias['condicoes_esgotamento']['valor'],medias['condicoes_esgotamento']['respostas_validas']))
        perc={p['codigo']:p for p in result['complementares']['percentuais']}
        for code,value,denom,num in [('SATISFEITOS',66.67,3,2),('COM_FALTA_AGUA',50,2,1),('OBSERVARAM_ESGOTO_EXPOSTO',66.67,3,2)]:
            self.assertEqual((value,denom,num),tuple(perc[code][k] for k in ('valor','respostas_validas','total_favoravel')))
        dist={d['campo']:d for d in result['complementares']['distribuicoes']}
        falta=dist['falta_agua_30_dias']
        self.assertEqual((2,1),(falta['respostas_validas'],falta['total_nao_sei']))
        self.assertEqual([50,50,0,0,0],[c['percentual'] for c in falta['categorias']])
        self.assertEqual(1,result['contadores']['total_comentarios'])
        self.assertNotIn('CONTEUDO_PRIVADO',json.dumps(result))
        self.assertNotIn('CONTEUDO_PRIVADO',json.dumps(self.get('',resumo=True)))
        self.assertNotIn('respostas',result)

    def test_vazio_desconhecidos_e_resumo_com_zeros(self):
        result=self.get()
        self.assertTrue(all(v==0 for v in result['contadores'].values()))
        for p in result['principais']:
            self.assertIsNone(p['valor']);self.assertEqual(0,p['respostas_validas'])
        for group in ('medias','percentuais'):
            self.assertTrue(all(p['valor'] is None for p in result['complementares'][group]))
        for d in result['complementares']['distribuicoes']:
            self.assertTrue(all(c['percentual'] is None for c in d['categorias']))
        self.inserir({**dict.fromkeys(PRINCIPAIS,'nao_sei'),
            'falta_agua_30_dias':'nao_sei','esgoto_ceu_aberto_30_dias':'nao_sei','satisfacao_saneamento':'nao_sei'})
        result=self.get()
        self.assertTrue(all(p['total_nao_sei']==1 and p['valor'] is None for p in result['principais']))
        self.assertTrue(all(d['total_nao_sei']==1 and d['respostas_validas']==0 for d in result['complementares']['distribuicoes']))
        resumo=self.get('',resumo=True)
        self.assertEqual(['355030801','355030802'],[d['territorio']['id_territorial'] for d in resumo['distritos']])
        self.assertEqual(0,resumo['distritos'][1]['contadores']['total_questionarios'])

    def test_periodo_inclusivo_timezone_e_limites_abertos(self):
        for data in ('2026-11-24T02:59:59Z','2026-11-24T03:00:00Z',
                     '2026-11-25T02:59:59.999999Z','2026-11-25T03:00:00Z'):
            self.inserir({PRINCIPAIS[0]:'sim'},data=data)
        self.conn.execute("SET LOCAL TIME ZONE 'Asia/Tokyo'")
        query='id_territorial=355030801&data_inicio=2026-11-24&data_fim=2026-11-24'
        result=self.get(query)
        self.assertEqual(2,result['contadores']['total_questionarios'])
        self.assertEqual('America/Sao_Paulo',result['periodo']['fuso_horario'])
        self.assertEqual(3,self.get('id_territorial=355030801&data_inicio=2026-11-24')['contadores']['total_questionarios'])
        self.assertEqual(3,self.get('id_territorial=355030801&data_fim=2026-11-24')['contadores']['total_questionarios'])
        resumo=self.get('data_inicio=2026-11-24&data_fim=2026-11-24',resumo=True)
        self.assertEqual(2,resumo['distritos'][0]['contadores']['total_questionarios'])
        self.assertEqual(0,resumo['distritos'][1]['contadores']['total_questionarios'])
        self.assertEqual(0,self.get('id_territorial=355030801&data_inicio=2027-01-01')['contadores']['total_questionarios'])

    def test_json_flexivel_nao_contamina_medias_e_vinculo(self):
        for value in ('10',True,False,1.5,-1,11,{},[],None):
            self.inserir({'regularidade_agua':value,'condicoes_esgotamento':value,PRINCIPAIS[0]:'invalido'})
        self.inserir({'regularidade_agua':0,'condicoes_esgotamento':0,PRINCIPAIS[0]:'sim'},vinculo=None)
        result=self.get()
        self.assertTrue(all(m['valor'] is None and m['respostas_validas']==0 for m in result['complementares']['medias']))
        self.assertEqual(1,result['contadores']['total_vinculo_nao_informado'])
        self.assertEqual(0,result['principais'][0]['respostas_validas'])

    def test_contagem_questionarios_nao_pessoas(self):
        for _ in range(2):
            self.inserir({PRINCIPAIS[0]:'sim'},comentario='repetido')
        self.inserir({PRINCIPAIS[0]:'sim'},versao=1,comentario='legado')
        result=self.get()
        self.assertEqual(2,result['contadores']['total_questionarios'])
        self.assertEqual(2,result['contadores']['total_comentarios'])
        self.assertEqual(result['contadores'],self.get('',resumo=True)['distritos'][0]['contadores'])

    def test_validacao_rotas_e_indisponibilidade(self):
        for query in ('','id_territorial=abc','id_territorial=3550308',
                      'id_territorial=355030801&data_inicio=invalida',
                      'id_territorial=355030801&data_fim=2026-02-30',
                      'id_territorial=355030801&data_inicio=2026-11-25&data_fim=2026-11-24'):
            self.get(query,status=422)
        self.get('id_territorial=355030899',status=404)
        self.conn.execute("""INSERT INTO territorio(id_territorial,id_municipio,nome,fonte,periodo,nivel)
            VALUES ('999999999','999999999','Municipio','teste','2022','municipio')""")
        self.get('id_territorial=999999999',status=404)
        self.get('data_inicio=2026-11-25&data_fim=2026-11-24',resumo=True,status=422)
        self.get('data_fim=invalida',resumo=True,status=422)
        with patch.object(router,'cursor',side_effect=psycopg.OperationalError('SQL PRIVADO')):
            for resumo in (False,True):
                body=self.get('' if resumo else 'id_territorial=355030801',resumo=resumo,status=503)
                self.assertNotIn('PRIVADO',json.dumps(body))
        status,schema=asyncio.run(request('GET',path='/openapi.json'))
        self.assertEqual(200,status)
        self.assertIn('/api/v1/questionario/indicadores',schema['paths'])
        self.assertIn('/api/v1/questionario/resumo-territorial',schema['paths'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
