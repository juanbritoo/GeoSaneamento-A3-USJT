"""Local integration tests. Require an isolated PostgreSQL/PostGIS test instance.

TEST_DATABASE_URL must be explicit and point to the disposable test instance.
Every scenario runs in a rolled-back transaction, including all fixture DDL/data.
"""
import os
import unittest
from contextlib import contextmanager
from unittest.mock import patch

import psycopg
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

from seed.init_db import read_schema
from app.classificacao import PONTOS, calcular_pontuacao, classificar
from app.routers import questionario
from app.schemas import QuestionarioEntrada, QuestionarioLista, QuestionarioResposta


class QuestionnaireMigrationTests(unittest.TestCase):
    def setUp(self):
        self.conn = psycopg.connect(os.environ['TEST_DATABASE_URL'])
        self.addCleanup(self.conn.close)
        self.addCleanup(self.conn.rollback)
        self.conn.execute('CREATE SCHEMA questionario_test')
        self.conn.execute('SET LOCAL search_path TO questionario_test, public')
        self.answers = {key: next(iter(options)) for key, options in PONTOS.items()}

    def insert_v1(self):
        score = calcular_pontuacao(self.answers)
        return self.conn.execute('''
            INSERT INTO resposta_questionario
                (id_territorial, respostas, pontuacao, nivel_saneamento)
            VALUES ('355030801', %s, %s, %s) RETURNING id
        ''', (Jsonb(self.answers), score, classificar(score))).fetchone()[0]

    def invalid(self, assignments, exception=psycopg.errors.CheckViolation):
        with self.assertRaises(exception):
            with self.conn.transaction():
                self.conn.execute('UPDATE resposta_questionario SET ' + assignments)

    def exercise(self, existing):
        schema = read_schema()
        migration = read_schema(True)
        if existing:
            # Original definition: same base schema, before the V2 ALTERs.
            legacy = schema.split('-- DEFAULT 1 identifica o legado')[0]
            self.conn.execute(legacy, prepare=False)
        else:
            self.conn.execute(schema, prepare=False)
        self.conn.execute('''
            INSERT INTO territorio (id_territorial, nome, fonte, periodo)
            VALUES ('355030801', 'Distrito de teste', 'Teste isolado', '2022')
        ''')
        self.insert_v1()
        before = self.conn.execute('''SELECT id, id_territorial, respostas,
            pontuacao, nivel_saneamento, criado_em FROM resposta_questionario''').fetchall()
        self.conn.execute(migration, prepare=False)
        self.assertEqual(before, self.conn.execute('''SELECT id, id_territorial, respostas,
            pontuacao, nivel_saneamento, criado_em FROM resposta_questionario''').fetchall())
        self.assertEqual((1, None, None), self.conn.execute('''SELECT versao_questionario,
            vinculo_territorial, comentario FROM resposta_questionario''').fetchone())
        self.insert_v1()
        self.invalid('versao_questionario = 0')
        self.invalid('versao_questionario = 3')
        self.invalid('versao_questionario = NULL', psycopg.errors.NotNullViolation)
        self.invalid('pontuacao = NULL')
        self.invalid('nivel_saneamento = NULL')
        self.invalid('pontuacao = -1')
        self.invalid('pontuacao = 101')
        self.invalid("nivel_saneamento = 'invalido'")
        self.invalid("id_territorial = 'inexistente'", psycopg.errors.ForeignKeyViolation)
        self.invalid('respostas = NULL', psycopg.errors.NotNullViolation)
        self.invalid("comentario = repeat('x', 501)", psycopg.errors.StringDataRightTruncation)
        payload = {'agua': 'sim', 'esgoto': 'nao_sei', 'nota': 10, 'nao_aplicavel': None}
        v2 = self.conn.execute('''INSERT INTO resposta_questionario
            (id_territorial, respostas, versao_questionario, vinculo_territorial, comentario)
            VALUES ('355030801', %s, 2, 'morador', %s) RETURNING id''',
            (Jsonb(payload), '\u00e1' * 500)).fetchone()[0]
        self.assertEqual((payload, None, None, 500), self.conn.execute('''SELECT respostas,
            pontuacao, nivel_saneamento, char_length(comentario)
            FROM resposta_questionario WHERE id=%s''', (v2,)).fetchone())
        self.conn.execute('''INSERT INTO resposta_questionario
            (id_territorial, respostas, versao_questionario, vinculo_territorial)
            VALUES ('355030801', %s, 2, 'nao_morador')''', (Jsonb(payload),))
        snapshot = self.conn.execute('SELECT * FROM resposta_questionario ORDER BY id').fetchall()
        constraints = self.conn.execute('''SELECT conname, pg_get_constraintdef(oid)
            FROM pg_constraint WHERE conrelid='resposta_questionario'::regclass
            ORDER BY conname''').fetchall()
        for sql in (migration, migration, schema):
            self.conn.execute(sql, prepare=False)
            self.assertEqual(snapshot, self.conn.execute(
                'SELECT * FROM resposta_questionario ORDER BY id').fetchall())
            self.assertEqual(constraints, self.conn.execute('''SELECT conname,
                pg_get_constraintdef(oid) FROM pg_constraint
                WHERE conrelid='resposta_questionario'::regclass ORDER BY conname''').fetchall())
        self.assertTrue(any('FOREIGN KEY' in definition for _, definition in constraints))
        self.assertIsNotNone(self.conn.execute(
            "SELECT to_regclass('idx_resposta_questionario_territorio')").fetchone()[0])

        @contextmanager
        def test_cursor():
            with self.conn.cursor(row_factory=dict_row) as cur:
                yield cur

        with patch.object(questionario, 'cursor', test_cursor):
            result = questionario.registrar_questionario(QuestionarioEntrada(
                id_territorial='355030801', respostas=self.answers))
            QuestionarioResposta.model_validate(result)
            self.assertEqual(1, self.conn.execute('''SELECT versao_questionario
                FROM resposta_questionario WHERE id=%s''', (result['id'],)).fetchone()[0])
            for district, level, expected in (
                (None, None, 3), ('355030801', result['nivel_saneamento'], 3),
                ('355030802', None, 0),
            ):
                listing = questionario.consultar_questionarios(district, level, 50, 0)
                QuestionarioLista.model_validate(listing)
                self.assertEqual(expected, listing['total'])
                self.assertEqual(expected, len(listing['itens']))
            listing = questionario.consultar_questionarios(None, None, 1, 1)
            self.assertEqual(3, listing['total'])
            self.assertEqual(1, len(listing['itens']))

    def test_existing_installation(self):
        self.exercise(existing=True)

    def test_new_installation(self):
        self.exercise(existing=False)


if __name__ == '__main__':
    unittest.main(verbosity=2)
