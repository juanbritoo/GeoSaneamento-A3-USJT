"""Contratos e rotas ASGI reais com PostgreSQL/PostGIS isolado e rollback."""
import asyncio
import copy
import json
import os
import unittest
from contextlib import contextmanager
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row

from app.main import app
from app.classificacao import PONTOS, calcular_pontuacao, classificar
from app.routers import questionario
from app.validacao_questionario import CAMPOS_DOMICILIARES
from seed.init_db import read_schema


def payload():
    return {
        'id_territorial': '355030801', 'versao_questionario': 2,
        'vinculo_territorial': 'morador_mais_1_ano',
        'respostas': {
            'abastecimento_agua_rede_geral': 'sim',
            'esgotamento_sanitario_rede_geral': 'nao',
            'destino_lixo_coleta_direta': 'nao_sei',
            'existencia_banheiro_exclusivo': 'sim',
            'falta_agua_30_dias': '1_2',
            'esgoto_ceu_aberto_30_dias': 'nao_sei',
            'satisfacao_saneamento': 'neutro',
            'regularidade_agua': 0, 'qualidade_agua_percebida': 10,
            'condicoes_esgotamento': None,
        }, 'comentario': '  Relato privado  ',
    }


async def request(method, data=None, query='', path='/api/v1/questionario'):
    messages = []
    sent = False

    async def receive():
        nonlocal sent
        if not sent:
            sent = True
            return {'type': 'http.request', 'body': json.dumps(data).encode(), 'more_body': False}
        await asyncio.Event().wait()

    async def send(message):
        messages.append(message)

    await app({'type': 'http', 'asgi': {'version': '3.0'}, 'http_version': '1.1',
               'method': method, 'scheme': 'http', 'path': path, 'raw_path': path.encode(),
               'query_string': query.encode(), 'root_path': '',
               'headers': [(b'content-type', b'application/json')],
               'server': ('test', 80), 'client': ('127.0.0.1', 1234)}, receive, send)
    status = next(m['status'] for m in messages if m['type'] == 'http.response.start')
    body = b''.join(m.get('body', b'') for m in messages if m['type'] == 'http.response.body')
    return status, json.loads(body)


class QuestionarioV2Tests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg.connect(os.environ['TEST_DATABASE_URL'])
        self.addCleanup(self.conn.close)
        self.addCleanup(self.conn.rollback)
        self.conn.execute('CREATE SCHEMA questionario_v2_test')
        self.conn.execute('SET LOCAL search_path TO questionario_v2_test, public')
        self.conn.execute(read_schema(), prepare=False)
        self.conn.execute("""INSERT INTO territorio (id_territorial,nome,fonte,periodo)
            VALUES ('355030801','Distrito A','teste','2022'),
                   ('355030802','Distrito B','teste','2022')""")

        @contextmanager
        def test_cursor():
            with self.conn.cursor(row_factory=dict_row) as cur:
                yield cur

        patcher = patch.object(questionario, 'cursor', test_cursor)
        patcher.start()
        self.addCleanup(patcher.stop)

    def call(self, method, data=None, query='', expected=200, path='/api/v1/questionario'):
        status, body = asyncio.run(request(method, data, query, path))
        self.assertEqual(expected, status, body)
        return body

    def reject(self, data):
        before = self.conn.execute('SELECT count(*) FROM resposta_questionario').fetchone()
        self.call('POST', data, expected=422)
        self.assertEqual(before, self.conn.execute('SELECT count(*) FROM resposta_questionario').fetchone())

    def test_v1_legacy_and_explicit(self):
        answers = {k: next(iter(v)) for k, v in PONTOS.items()}
        data = {'id_territorial': '355030801', 'respostas': answers}
        for explicit in (False, True):
            if explicit:
                data['versao_questionario'] = 1
            result = self.call('POST', data, expected=201)
            self.assertEqual(set(result), {'id','id_territorial','nome_territorio','respostas',
                                         'pontuacao','nivel_saneamento','criado_em'})
            self.assertEqual(calcular_pontuacao(answers), result['pontuacao'])
            self.assertEqual(classificar(result['pontuacao']), result['nivel_saneamento'])
        self.assertEqual(2, self.call('GET')['total'])

    def test_v2_persistence_and_privacy(self):
        result = self.call('POST', payload(), expected=201)
        self.assertEqual('Relato privado', result['comentario'])
        self.assertNotIn('pontuacao', result)
        self.assertNotIn('nivel_saneamento', result)
        row = self.conn.execute("""SELECT versao_questionario, pontuacao,nivel_saneamento,
            respostas, comentario, vinculo_territorial,
            jsonb_typeof(respostas->'regularidade_agua'),
            jsonb_typeof(respostas->'condicoes_esgotamento') FROM resposta_questionario""").fetchone()
        self.assertEqual((2,None,None), row[:3])
        self.assertEqual(payload()['respostas'], row[3])
        self.assertEqual(('Relato privado','morador_mais_1_ano','number','null'),row[4:])
        self.assertEqual([],self.call('GET')['itens'])
        listing = self.call('GET',query='versao_questionario=2')
        self.assertEqual(1,listing['total'])
        self.assertNotIn('comentario',listing['itens'][0])
        self.assertNotIn('Relato privado',json.dumps(listing))

    def test_non_residents(self):
        for vinculo in ('trabalha_estuda','sem_vinculo_frequente'):
            data=payload()
            data['vinculo_territorial']=vinculo
            for field in CAMPOS_DOMICILIARES:
                data['respostas'][field]=None
            result=self.call('POST',data,expected=201)
            self.assertEqual(data['respostas'],result['respostas'])
            for field in CAMPOS_DOMICILIARES:
                with self.subTest(vinculo=vinculo,field=field):
                    invalid=copy.deepcopy(data)
                    invalid['respostas'][field]=payload()['respostas'][field]
                    self.reject(invalid)

    def test_required_and_categories(self):
        for field in payload()['respostas']:
            with self.subTest(missing=field):
                data=payload()
                del data['respostas'][field]
                self.reject(data)
        for field in ('id_territorial','versao_questionario','vinculo_territorial','respostas'):
            data=payload()
            del data[field]
            self.reject(data)
        for field in list(payload()['respostas'])[:7]:
            data=payload()
            data['respostas'][field]='invalido'
            self.reject(data)
        for field in CAMPOS_DOMICILIARES[:5]:
            data=payload()
            data['respostas'][field]=None
            self.reject(data)
        for value in ('morador',None,''):
            data=payload()
            data['vinculo_territorial']=value
            self.reject(data)
        for value in (0,3,None,'2'):
            data=payload()
            data['versao_questionario']=value
            self.reject(data)
        for nested in (False,True):
            data=payload()
            (data['respostas'] if nested else data)['extra']='x'
            self.reject(data)

    def test_numeric_validation(self):
        for field in ('regularidade_agua','qualidade_agua_percebida','condicoes_esgotamento'):
            for value in (-1,11,1.5,1.0,True,False,'5','',[],{}):
                with self.subTest(field=field,value=value):
                    data=payload()
                    data['respostas'][field]=value
                    self.reject(data)
            for value in (0,10,None):
                data=payload()
                data['respostas'][field]=value
                result=self.call('POST',data,expected=201)
                self.assertEqual(value,result['respostas'][field])

    def test_comments(self):
        for value,expected in ((None,None),('',None),(' \t\n ',None),('  texto  ','texto'),('\u00e1'*500,'\u00e1'*500)):
            data=payload()
            data['comentario']=value
            self.assertEqual(expected,self.call('POST',data,expected=201)['comentario'])
        data=payload()
        del data['comentario']
        self.assertIsNone(self.call('POST',data,expected=201)['comentario'])
        for value in ('x'*501,' '*501,123,True):
            data=payload()
            data['comentario']=value
            self.reject(data)

    def test_territory(self):
        for value in ('355030899','000000000'):
            data=payload()
            data['id_territorial']=value
            self.call('POST',data,expected=404)
        for value in ('3550308','abcdefghi',355030801,'3550308010'):
            data=payload()
            data['id_territorial']=value
            self.reject(data)
        # A valid nine-digit identifier with municipality level must also be rejected.
        self.conn.execute("""INSERT INTO territorio
            (id_territorial,id_municipio,nome,fonte,periodo,nivel)
            VALUES ('999999999','999999999','Municipio teste','teste','2022','municipio')""")
        data=payload()
        data['id_territorial']='999999999'
        self.call('POST',data,expected=404)

    def test_get_versions_filters_pagination(self):
        v1=self.call('POST',{'id_territorial':'355030801','respostas':
            {k:next(iter(v)) for k,v in PONTOS.items()}},expected=201)
        for territory in ('355030801','355030802','355030801'):
            data=payload()
            data['id_territorial']=territory
            self.call('POST',data,expected=201)
        self.assertEqual(1,self.call('GET')['total'])
        self.assertEqual(1,self.call('GET',query='versao_questionario=1')['total'])
        self.assertEqual(1,self.call('GET',query='nivel_saneamento='+v1['nivel_saneamento'])['total'])
        result=self.call('GET',query='versao_questionario=2&id_territorial=355030801&limite=1&deslocamento=1')
        self.assertEqual(2,result['total'])
        self.assertEqual(1,len(result['itens']))
        self.assertEqual(2,result['itens'][0]['versao_questionario'])
        self.assertNotIn('comentario',result['itens'][0])
        self.assertEqual([],self.call('GET',query='versao_questionario=2&deslocamento=99')['itens'])
        for query in ('versao_questionario=2&nivel_saneamento=adequado','versao_questionario=3',
                      'versao_questionario=0','versao_questionario=abc','versao_questionario=1.5',
                      'limite=0','limite=201','deslocamento=-1','id_territorial=abc'):
            self.call('GET',query=query,expected=422)

    def test_openapi_and_503(self):
        schema=self.call('GET',path='/openapi.json')
        examples=schema['paths']['/api/v1/questionario']['post']['requestBody']['content']['application/json']['examples']
        for example in examples.values():
            self.call('POST',example['value'],expected=201)
        self.assertNotIn('comentario',schema['components']['schemas']['QuestionarioItemV2']['properties'])
        with patch.object(questionario,'cursor',side_effect=psycopg.OperationalError('secret SQL detail')):
            for method,data in (('GET',None),('POST',payload())):
                result=self.call(method,data,expected=503)
                self.assertNotIn('secret',json.dumps(result))


if __name__=='__main__':
    unittest.main(verbosity=2)
