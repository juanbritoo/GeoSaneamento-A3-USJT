
import os
from contextlib import asynccontextmanager

import psycopg
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from psycopg_pool import PoolTimeout

from .db import pool
from .routers import distritos, health, saneamento


@asynccontextmanager
async def lifespan(app: FastAPI):
    pool.open()
    yield
    pool.close()


app = FastAPI(title="GeoSaneamento API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("CORS_ORIGINS", "http://localhost:5173,http://localhost:3000").split(","),
    allow_methods=["GET"],
    allow_headers=["*"],
)


@app.exception_handler(psycopg.OperationalError)
async def banco_indisponivel(_: Request, __: psycopg.OperationalError):
    return JSONResponse(status_code=503, content={"detail": "Dados territoriais indisponíveis no momento."})


@app.exception_handler(PoolTimeout)
async def pool_indisponivel(_: Request, __: PoolTimeout):
    return JSONResponse(status_code=503, content={"detail": "Banco de dados indisponível."})



# Rotas registradas nos módulos por responsabilidade.
app.include_router(health.router)
app.include_router(saneamento.router)
app.include_router(distritos.router)
