
import os
from contextlib import asynccontextmanager
from typing import Any, Literal, Optional

import psycopg
from fastapi import FastAPI, HTTPException, Path, Query, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from psycopg_pool import PoolTimeout

from .db import cursor, pool

ID_PATTERN = r"^\d{9}$"  


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
    fonte: str       
    periodo: str     
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


class SaneamentoValor(BaseModel):
    codigo: str
    nome: str
    valor: Optional[float]
    unidade: Optional[str]
    fonte: str
    periodo: str
    is_mock: bool
    id_fonte: str
    classificacao_fonte: Literal["oficial", "nao_verificada", "ficticia"]
    procedencia: str
    dimensoes: Any


class SaneamentoTerritorio(BaseModel):
    id_territorial: str
    nome: str
    indicadores: list[SaneamentoValor]


class SaneamentoResponse(BaseModel):
    escala: Literal["municipio", "distrito"]
    territorios: list[SaneamentoTerritorio]


#Consultas
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


# Rotas
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
    response_model=SaneamentoResponse,
    summary="Consulta de saneamento por escala territorial",
    description=(
        "Consulta valores disponíveis na escala municipal ou distrital. "
        "A escala municipal usa São Paulo como padrão; sem identificador distrital, "
        "consulta distritos. A resposta preserva fonte, procedência e is_mock."
    ),
    responses={
        404: {"model": ErroAPI, "description": "Território não encontrado na escala informada."},
        422: {"model": ErroAPI, "description": "Parâmetro inválido ou indicador inexistente."},
        503: {"model": ErroAPI, "description": "Banco de dados indisponível."},
    },
    tags=["US02 - Saneamento"],
)
def consultar_saneamento(
    escala: Literal["municipio", "distrito"] = Query(
        ..., description="Escala territorial da consulta."
    ),
    id_territorial: Optional[str] = Query(
        None, min_length=7, max_length=9,
        description="Código IBGE do município ou distrito. Município padrão: São Paulo (3550308)."
    ),
    indicador: Optional[str] = Query(None, min_length=1, max_length=200, description="Código existente no catálogo de indicadores."),
    periodo: Optional[str] = Query(None, min_length=1, max_length=50, description="Período de referência armazenado."),
):
    if id_territorial is not None:
        tamanho_esperado = 7 if escala == "municipio" else 9
        if not id_territorial.isascii() or not id_territorial.isdigit() or len(id_territorial) != tamanho_esperado:
            formato = "7 dígitos para município" if escala == "municipio" else "9 dígitos para distrito"
            raise HTTPException(422, f"id_territorial deve conter {formato}.")

    if escala == "municipio":
        id_consulta = id_territorial or "3550308"
        filtro_id, params_territorio = "id_territorial = %s", (id_consulta,)
    elif id_territorial is not None:
        filtro_id, params_territorio = "id_territorial = %s", (id_territorial,)
    else:
        filtro_id, params_territorio = "TRUE", ()

    with cursor() as cur:
        cur.execute(
            f"SELECT id_territorial, nome FROM territorio WHERE nivel = %s AND {filtro_id} ORDER BY nome",
            (escala, *params_territorio),
        )
        territorios = cur.fetchall()
        if id_territorial is not None or escala == "municipio":
            if not territorios:
                raise HTTPException(404, "Território não encontrado na escala informada.")

        if indicador is not None:
            cur.execute("SELECT 1 FROM indicador WHERE codigo = %s", (indicador,))
            if cur.fetchone() is None:
                raise HTTPException(422, "Indicador inexistente no catálogo.")

        ids = [territorio["id_territorial"] for territorio in territorios]
        if not ids:
            return {"escala": escala, "territorios": []}

        filtros = ["v.id_territorial = ANY(%s)"]
        parametros = [ids]
        if indicador is not None:
            filtros.append("v.indicador = %s")
            parametros.append(indicador)
        if periodo is not None:
            filtros.append("v.periodo = %s")
            parametros.append(periodo)

        cur.execute(
            """
            SELECT v.id_territorial, v.indicador AS codigo, i.nome,
                   v.valor::float8 AS valor, v.unidade, v.fonte, v.periodo,
                   v.is_mock, v.id_fonte, f.classificacao AS classificacao_fonte,
                   f.procedencia, v.dimensoes
            FROM valor_indicador v
            JOIN indicador i ON i.codigo = v.indicador
            JOIN fonte_dado f ON f.id_fonte = v.id_fonte
            WHERE """ + " AND ".join(filtros) + " ORDER BY v.id_territorial, v.periodo, v.indicador",
            tuple(parametros),
        )
        valores = cur.fetchall()

    por_territorio = {
        item["id_territorial"]: {**item, "indicadores": []} for item in territorios
    }
    for valor in valores:
        id_valor = valor.pop("id_territorial")
        por_territorio[id_valor]["indicadores"].append(valor)

    # Nenhum valor correspondente aos filtros resulta em 200 com lista vazia.
    resultados = [item for item in por_territorio.values() if item["indicadores"]]
    return {"escala": escala, "territorios": resultados}


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
