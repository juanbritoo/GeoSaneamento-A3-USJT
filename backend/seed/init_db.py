#!/usr/bin/env python3
"""Apply the additive, repeatable database schema without removing existing data."""

import argparse
import os
from pathlib import Path

import psycopg


SCHEMA_FILE = Path(__file__).with_name("schema.sql")
DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/geosaneamento"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--db",
        default=os.getenv("DATABASE_URL", DEFAULT_DATABASE_URL),
        help="Database URL (defaults to DATABASE_URL).",
    )
    args = parser.parse_args()

    schema = SCHEMA_FILE.read_text(encoding="utf-8")
    with psycopg.connect(args.db, connect_timeout=10) as conn:
        conn.execute(schema, prepare=False)

    print("Schema aplicado com sucesso; nenhum volume ou dado existente foi removido.")


if __name__ == "__main__":
    main()
