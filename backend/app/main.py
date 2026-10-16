"""
GeoSaneamento - API (FastAPI)

O frontend consome SOMENTE esta API (DT01/DT05). Ela só lê o banco já tratado;
a ingestão fica no pipeline (geosaneamento_seed.py / load_db.py).

Rodar:  uvicorn app.main:app --reload     (dentro da pasta backend/)
Docs:   http://localhost:8000/docs
"""
import os
from contextlib import asynccontextmanager
from typing import Literal, Optional

import psycopg
from fastapi import FastAPI, HTTPException, Path, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from .db import cursor, pool

ID_PATTERN = r"^\d{9}$"  # código IBGE do distrito (RN03 / EX04)


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
    # RF13 / EX02: informar indisponibilidade em vez de devolver dados inconsistentes
    return JSONResponse(status_code=503, content={"detail": "Dados territoriais indisponíveis no momento."})


# ---------- modelos de resposta ----------
class ErroAPI(BaseModel):
    detail: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    database: str
    database_status: Literal["connected"]


class IndicadorValor(BaseModel):
    codigo: str
    nome: str
    valor: Optional[float]
    unidade: Optional[str]
    fonte: str       # DT07: fonte sempre visível
    periodo: str     # DT07: período sempre visível
    is_mock: bool
    id_fonte: str
    classificacao_fonte: Literal["oficial", "nao_verificada", "ficticia"]
    procedencia: str


class DistritoResumo(BaseModel):
    id_territorial: str
    nome: str


class DistritoDetalhe(DistritoResumo):
    id_municipio: str
    fonte: str
    periodo: str
    centroide: Optional[dict]   # {"lat":..., "lng":...}
    id_fonte: str
    classificacao_fonte: Literal["oficial", "nao_verificada", "ficticia"]
    procedencia: str
    indicadores: list[IndicadorValor]


class IndicadorCatalogo(BaseModel):
    codigo: str
    nome: str
    unidade: str


# ---------- consultas ----------
SQL_INDICADORES = """
    SELECT v.indicador AS codigo, i.nome, v.valor::float8 AS valor, v.unidade,
           v.fonte, v.periodo, v.is_mock, v.id_fonte,
           f.classificacao AS classificacao_fonte, f.procedencia
    FROM valor_indicador v
    JOIN indicador i ON i.codigo = v.indicador
    JOIN fonte_dado f ON f.id_fonte = v.id_fonte
    WHERE v.id_territorial = %s
    ORDER BY i.codigo
"""


def _indicadores(cur, id_territorial: str) -> list[dict]:
    cur.execute(SQL_INDICADORES, (id_territorial,))
    return cur.fetchall()


# ---------- rotas ----------
@app.get(
    "/health",
    response_model=HealthResponse,
    responses={503: {"model": ErroAPI, "description": "Banco de dados indisponível."}},
    tags=["Sistema"],
)
def health():
    with cursor() as cur:
        cur.execute("SELECT current_database() AS database")
        return {
            "status": "ok",
            "database": cur.fetchone()["database"],
            "database_status": "connected",
        }


@app.get(
    "/api/v1/saneamento",
    status_code=status.HTTP_501_NOT_IMPLEMENTED,
    response_model=ErroAPI,
    summary="Consulta de saneamento por escala territorial",
    description=(
        "Contrato previsto para a visão municipal ou distrital. "
        "A consulta de indicadores será implementada na etapa de endpoints funcionais."
    ),
    responses={501: {"model": ErroAPI, "description": "Consulta ainda não implementada."}},
    tags=["US02 - Saneamento"],
)
def consultar_saneamento(
    escala: Literal["municipio", "distrito"] = Query(
        ..., description="Escala territorial da consulta."
    ),
    id_territorial: Optional[str] = Query(
        None, description="Código IBGE do município ou distrito; por padrão, São Paulo."
    ),
    indicador: Optional[str] = Query(None, description="Código do indicador, quando informado."),
    periodo: Optional[str] = Query(None, description="Período de referência, quando informado."),
):
    raise HTTPException(
        status_code=status.HTTP_501_NOT_IMPLEMENTED,
        detail="A consulta funcional de indicadores será implementada na etapa de endpoints.",
    )


@app.get(
    "/distritos", response_model=list[DistritoResumo],
    responses={503: {"model": ErroAPI, "description": "Banco de dados indisponível."}},
    tags=["Compatibilidade"],
)
def listar_distritos():
    with cursor() as cur:
        cur.execute("SELECT id_territorial, nome FROM territorio WHERE nivel = 'distrito' ORDER BY nome")
        return cur.fetchall()


@app.get(
    "/distritos/geojson",
    responses={503: {"model": ErroAPI, "description": "Banco indisponível ou malha não disponível."}},
    tags=["Compatibilidade"],
)
def malha_geojson():
    """FeatureCollection para o React-Leaflet (US01: RF03, RF04, RF10)."""
    with cursor() as cur:
        cur.execute("""
            SELECT jsonb_build_object(
                'type', 'FeatureCollection',
                'features', COALESCE(jsonb_agg(jsonb_build_object(
                    'type', 'Feature',
                    'id', id_territorial,
                    'geometry', ST_AsGeoJSON(geom, 6)::jsonb,
                    'properties', jsonb_build_object('id_territorial', id_territorial, 'nome', nome)
                )), '[]'::jsonb)
            ) AS fc
            FROM territorio WHERE nivel = 'distrito' AND geom IS NOT NULL
        """)
        fc = cur.fetchone()["fc"]
    if not fc["features"]:
        raise HTTPException(503, "Malha territorial indisponível.")  # EX02
    return JSONResponse(fc, media_type="application/geo+json")


@app.get(
    "/distritos/{id_territorial}", response_model=DistritoDetalhe,
    responses={
        404: {"model": ErroAPI, "description": "Distrito não encontrado."},
        503: {"model": ErroAPI, "description": "Banco de dados indisponível."},
    },
    tags=["Compatibilidade"],
)
def detalhar_distrito(id_territorial: str = Path(pattern=ID_PATTERN)):
    with cursor() as cur:
        cur.execute("""
            SELECT t.id_territorial, t.nome, t.id_municipio, t.fonte, t.periodo,
                   t.id_fonte, f.classificacao AS classificacao_fonte, f.procedencia,
                   CASE WHEN geom IS NULL THEN NULL ELSE
                        jsonb_build_object('lat', ST_Y(ST_PointOnSurface(geom)),
                                           'lng', ST_X(ST_PointOnSurface(geom))) END AS centroide
            FROM territorio t JOIN fonte_dado f ON f.id_fonte = t.id_fonte
            WHERE t.id_territorial = %s AND t.nivel = 'distrito'
        """, (id_territorial,))
        d = cur.fetchone()
        if d is None:
            raise HTTPException(404, "Distrito não encontrado.")
        d["indicadores"] = _indicadores(cur, id_territorial)
    return d


@app.get(
    "/distritos/{id_territorial}/indicadores", response_model=list[IndicadorValor],
    responses={
        404: {"model": ErroAPI, "description": "Distrito não encontrado."},
        503: {"model": ErroAPI, "description": "Banco de dados indisponível."},
    },
    tags=["Compatibilidade"],
)
def indicadores_do_distrito(id_territorial: str = Path(pattern=ID_PATTERN)):
    with cursor() as cur:
        cur.execute("SELECT 1 FROM territorio WHERE id_territorial = %s AND nivel = 'distrito'", (id_territorial,))
        if cur.fetchone() is None:
            raise HTTPException(404, "Distrito não encontrado.")
        return _indicadores(cur, id_territorial)


@app.get(
    "/indicadores", response_model=list[IndicadorCatalogo],
    responses={503: {"model": ErroAPI, "description": "Banco de dados indisponível."}},
    tags=["Compatibilidade"],
)
def catalogo_indicadores():
    with cursor() as cur:
        cur.execute("SELECT codigo, nome, unidade FROM indicador ORDER BY codigo")
        return cur.fetchall()
