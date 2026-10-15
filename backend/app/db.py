import os
from contextlib import contextmanager

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/geosaneamento")

# open=False: o pool é aberto/fechado no lifespan do FastAPI (ver main.py)
pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=5, open=False, kwargs={"row_factory": dict_row})


@contextmanager
def cursor():
    with pool.connection() as conn, conn.cursor() as cur:
        yield cur
