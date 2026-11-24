#!/usr/bin/env python3
"""Apply the additive, repeatable database schema without removing existing data."""

import argparse
import os
from pathlib import Path

import psycopg


SCHEMA_FILE = Path(__file__).with_name("schema.sql")
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/geosaneamento"


def read_schema(questionario_only: bool = False) -> str:
    schema = SCHEMA_FILE.read_text(encoding="utf-8")
    if questionario_only:
        start = "-- BEGIN QUESTIONARIO MIGRATION"
        end = "-- END QUESTIONARIO MIGRATION"
        if schema.count(start) != 1 or schema.count(end) != 1:
            raise ValueError("Bloco canonico do questionario ausente ou duplicado")
        schema = schema.split(start, 1)[1].split(end, 1)[0]
    return schema


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
        help="Database URL (defaults to DATABASE_URL).",
    )
    parser.add_argument(
        "--questionario-only",
        action="store_true",
        help="Apply only the questionnaire migration; territorio must already exist.",
    )
    args = parser.parse_args()

    schema = read_schema(args.questionario_only)
    with psycopg.connect(args.db, connect_timeout=10) as conn:
        # Uma transacao: falhas desfazem toda a migracao, sem estado parcial.
        conn.execute("SET LOCAL lock_timeout = '10s'")
        conn.execute(schema, prepare=False)

    print("Schema aplicado com sucesso; nenhum volume ou dado existente foi removido.")


if __name__ == "__main__":
    main()
