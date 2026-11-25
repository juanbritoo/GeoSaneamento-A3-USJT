"""Comparacao e SQL reais, exclusivamente em banco isolado com rollback."""
import asyncio
import json
import os
import unittest
from contextlib import contextmanager
from datetime import date
from decimal import Decimal
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from app.correlacao import METODOLOGIAS_V2, comparar, resumir
from app.indicadores_participativos import PRINCIPAIS, agregar_indicadores
from app.routers import correlacao as router
from seed.init_db import read_schema
from test_questionario_v2 import request


class CorrelacaoTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg.connect(os.environ['TEST_DATABASE_URL'])
        self.addCleanup(self.conn.close)
        self.addCleanup(self.conn.rollback)
        self.conn.execute('CREATE SCHEMA correlacao_test')
        self.conn.execute('SET LOCAL search_path TO correlacao_test, public')
        self.conn.execute(read_schema(), prepare=False)
        self.conn.execute("""INSERT INTO territorio(id_territorial,nome,fonte,periodo)
            VALUES ('355030801','Distrito A','teste','2026'), ('355030802','Distrito B','teste','2026')""")
        self.conn.execute("""INSERT INTO fonte_dado(id_fonte,nome,classificacao,procedencia)
            VALUES ('teste_oficial','Fixture oficial','oficial','Fonte distrital validada apenas para teste')""")
        for code in METODOLOGIAS_V2:
            self.conn.execute('INSERT INTO indicador(codigo,nome,unidade) VALUES (%s,%s,%s)', (code,code,'%'))
        self.queries = 0

        @contextmanager
        def test_cursor():
            with self.conn.cursor(row_factory=dict_row) as cur:
                owner = self
                class CountCursor:
                    def execute(self, *args, **kwargs):
                        owner.queries += 1
                        return cur.execute(*args, **kwargs)
                    def fetchall(self):
                        return cur.fetchall()
                yield CountCursor()
        patcher = patch.object(router, 'cursor', test_cursor)
        patcher.start()
        self.addCleanup(patcher.stop)

    def respostas(self, quantidade, respostas=None, versao=2, vinculo='morador_mais_1_ano',
                  data='2026-11-24T12:00:00-03:00', territorio='355030801'):
        for _ in range(quantidade):
            self.conn.execute('''INSERT INTO resposta_questionario
                (id_territorial,respostas,versao_questionario,vinculo_territorial,criado_em,pontuacao,nivel_saneamento,comentario)
                VALUES (%s,%s,%s,%s,%s,%s,%s,'SEGREDO_PRIVADO')''',
                (territorio,Jsonb(respostas if respostas is not None else dict.fromkeys(PRINCIPAIS,'sim')),
                 versao,vinculo,data,50 if versao==1 else None,'precario' if versao==1 else None))

    def referencia(self, campo=PRINCIPAIS[0], valor=92, periodo='2026', unidade='%', mock=False,
                   fonte='teste_oficial', dimensoes=None, territorio='355030801', nome_fonte='Fonte fixture'):
        codigo=campo.upper()
        self.conn.execute('''INSERT INTO valor_indicador
            (id_territorial,indicador,valor,unidade,fonte,periodo,is_mock,id_fonte,dimensoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)''',
            (territorio,codigo,valor,unidade,nome_fonte,periodo,mock,fonte,
             Jsonb(dimensoes if dimensoes is not None else {'metodologia_comparavel_v2':METODOLOGIAS_V2[codigo]})))

    def get(self, query='id_territorial=355030801', status=200):
        actual, body=asyncio.run(request('GET',path='/api/v1/correlacao',query=query))
        self.assertEqual(actual,status,body)
        return body

    def test_92_72_denominadores_reuso_e_privacidade(self):
        self.respostas(72, {PRINCIPAIS[0]:'sim',PRINCIPAIS[1]:'nao'})
        self.respostas(28, {PRINCIPAIS[0]:'nao',PRINCIPAIS[1]:'nao_sei'})
        self.respostas(20, {PRINCIPAIS[0]:'nao_sei',PRINCIPAIS[2]:'sim'})
        self.respostas(1,versao=1)
        self.respostas(3,vinculo='trabalha_estuda')
        self.referencia()
        self.referencia(PRINCIPAIS[1],valor=10)
        self.referencia(PRINCIPAIS[2],valor=0)
        result=self.get()
        d=result['distritos'][0]
        items={i['codigo']:i for i in d['indicadores']}
        agua=items[PRINCIPAIS[0].upper()]
        self.assertEqual((92,72,100,20,20,'divergencia_elevada'),tuple(agua[k] for k in
                         ('valor_oficial','valor_participativo','respostas_validas','divergencia_pp','divergencia_absoluta_pp','status')))
        self.assertEqual('amostra_insuficiente',items[PRINCIPAIS[2].upper()]['status'])
        self.assertEqual(123,d['total_questionarios'])
        self.assertEqual((2,2,15,20,True),tuple(d['resumo'][k] for k in
            ('indicadores_comparados','indicadores_divergentes','divergencia_media_absoluta_pp','maior_divergencia_absoluta_pp','exibir_alerta')))
        self.assertEqual(PRINCIPAIS[0].upper(),d['resumo']['indicador_critico'])
        self.assertNotIn('SEGREDO_PRIVADO',json.dumps(result))
        with self.conn.cursor(row_factory=dict_row) as cur:
            anterior=agregar_indicadores(cur,'355030801')
        for p in anterior['principais']:
            self.assertEqual((p['valor'],p['respostas_validas']),
                             (items[p['codigo']]['valor_participativo'],items[p['codigo']]['respostas_validas']))

    def test_limites_direcao_zero_e_arredondamento(self):
        self.respostas(15)
        self.respostas(15,dict.fromkeys(PRINCIPAIS,'nao'))
        for campo,valor in zip(PRINCIPAIS, (Decimal('40'),Decimal('70'),Decimal('50'),Decimal('59.99'))):
            self.referencia(campo,valor)
        items={i['codigo']:i for i in self.get()['distritos'][0]['indicadores']}
        for campo,delta,status in zip(PRINCIPAIS,(-10,20,0,9.99),
            ('possivel_divergencia','divergencia_elevada','sem_alerta','sem_alerta')):
            self.assertEqual((delta,status),(items[campo.upper()]['divergencia_pp'],items[campo.upper()]['status']))
        p=dict(codigo=PRINCIPAIS[0].upper(),valor_participativo=Decimal('72'),respostas_validas=30,
               total_questionarios=30,primeira_resposta=date(2026,1,1),ultima_resposta=date(2026,1,2))
        ref=dict(valor=Decimal('91.994'),unidade='%',unidade_catalogo='%',fonte='f',periodo='2026',
            is_mock=False,id_fonte='f',classificacao_fonte='oficial',procedencia='validada',
            dimensoes={'metodologia_comparavel_v2':METODOLOGIAS_V2[p['codigo']]})
        self.assertEqual(Decimal('19.99'),comparar(p,[ref])['divergencia_pp'])
        p['respostas_validas']=29
        self.assertEqual('amostra_insuficiente',comparar(p,[ref])['status'])

    def test_simulados_nao_oficiais_e_incompativeis(self):
        self.respostas(30,dict.fromkeys(PRINCIPAIS,'nao'))
        self.referencia(mock=True)
        self.referencia(PRINCIPAIS[1],fonte='projeto_json_nao_verificado')
        self.referencia(PRINCIPAIS[2],dimensoes={})
        self.referencia(PRINCIPAIS[3],unidade='Unidades')
        d=self.get()['distritos'][0]
        self.assertTrue(all(i['status']=='nao_comparavel' for i in d['indicadores']))
        self.assertEqual(2,sum(i['simulacao'] is not None for i in d['indicadores']))
        self.assertTrue(all(i['divergencia_pp'] is None for i in d['indicadores']))
        self.assertFalse(d['resumo']['exibir_alerta'])
        self.assertIsNone(d['resumo']['maior_divergencia_absoluta_pp'])

    def test_sem_dados_ausencia_e_municipio_nao_substitui(self):
        self.referencia(territorio='3550308')
        result=self.get('')
        self.assertEqual(2,len(result['distritos']))
        self.assertEqual(2,self.queries)
        self.assertTrue(all(d['resumo']['status']=='sem_dados' for d in result['distritos']))
        self.respostas(30)
        d=self.get()['distritos'][0]
        self.assertEqual('nao_comparavel',d['resumo']['status'])
        self.assertTrue(all(i['valor_oficial'] is None for i in d['indicadores']))
        self.respostas(1,{},territorio='355030802')
        self.assertEqual('amostra_insuficiente',self.get('id_territorial=355030802')['distritos'][0]['resumo']['status'])

    def test_periodos_e_fontes_ambiguas(self):
        self.respostas(30)
        self.referencia(periodo='2022')
        self.assertIn('anos',self.get()['distritos'][0]['indicadores'][0]['motivo'])
        self.referencia(periodo='2026')
        self.assertEqual('sem_alerta',self.get()['distritos'][0]['indicadores'][0]['status'])
        self.assertEqual('2022',self.get('periodo_oficial=2022')['distritos'][0]['indicadores'][0]['periodo'])
        self.referencia(periodo='2026',nome_fonte='Segunda fonte')
        self.assertIn('ambiguas',self.get()['distritos'][0]['indicadores'][0]['motivo'])
        self.referencia(periodo='2025/2026')
        self.assertIn('nao anual',self.get('periodo_oficial=2025%2F2026')['distritos'][0]['indicadores'][0]['motivo'])

    def test_filtros_temporais_e_validacao(self):
        self.respostas(30,data='2026-01-01T03:00:00Z')
        self.respostas(1,data='2026-01-01T02:59:59Z')
        self.referencia()
        self.assertEqual('nao_comparavel',self.get()['distritos'][0]['indicadores'][0]['status'])
        d=self.get('id_territorial=355030801&data_inicio=2026-01-01&data_fim=2026-01-01')['distritos'][0]
        self.assertEqual(30,d['total_questionarios'])
        self.assertEqual('sem_alerta',d['indicadores'][0]['status'])
        self.assertEqual('sem_dados',self.get('data_inicio=2027-01-01')['distritos'][0]['resumo']['status'])
        for query in ('id_territorial=abc','id_territorial=3550308','data_inicio=2026-02-30',
                      'data_inicio=2026-02-01&data_fim=2026-01-01','periodo_oficial=','periodo_oficial=%20'):
            self.get(query,status=422)
        self.get('id_territorial=999999999',status=404)
        with patch.object(router,'cursor',side_effect=psycopg.OperationalError('SQL_INTERNO')):
            self.assertNotIn('SQL_INTERNO',json.dumps(self.get(status=503)))

    def test_valores_invalidos_dimensoes_e_catalogo(self):
        self.respostas(30)
        self.referencia(valor=None)
        self.referencia(PRINCIPAIS[1],valor=101)
        self.referencia(PRINCIPAIS[2],dimensoes={'metodologia_comparavel_v2':METODOLOGIAS_V2[PRINCIPAIS[2].upper()],'recorte':'parcial'})
        self.referencia(PRINCIPAIS[3])
        self.conn.execute('UPDATE indicador SET unidade=%s WHERE codigo=%s',('Unidades',PRINCIPAIS[3].upper()))
        d=self.get()['distritos'][0]
        self.assertTrue(all(i['status']=='nao_comparavel' for i in d['indicadores']))
        self.assertFalse(d['resumo']['exibir_alerta'])

    def test_prioriza_oficial_e_maior_nao_media(self):
        self.respostas(30)
        for campo,valor in zip(PRINCIPAIS,(100,100,100,80)):
            self.referencia(campo,valor)
        self.referencia(valor=0,mock=True,periodo='2027',nome_fonte='Simulacao futura')
        d=self.get()['distritos'][0]
        self.assertEqual('2026',d['indicadores'][0]['periodo'])
        self.assertEqual((5,20,'divergencia_elevada',True),tuple(d['resumo'][k] for k in
            ('divergencia_media_absoluta_pp','maior_divergencia_absoluta_pp','status','exibir_alerta')))
        self.assertEqual(d['resumo'],json.loads(json.dumps(resumir(d['indicadores'],30),default=float)))


if __name__ == '__main__':
    unittest.main()
