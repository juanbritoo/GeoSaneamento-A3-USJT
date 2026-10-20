from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse

from ..db import cursor
from ..schemas import DistritoResumo, ErroAPI

router = APIRouter()


@router.get(
    "/distritos",
    response_model=list[DistritoResumo],
    responses={503: {"model": ErroAPI, "description": "Banco de dados indisponível."}},
    tags=["Compatibilidade"],
)
def listar_distritos():
    with cursor() as cur:
        cur.execute(
            "SELECT id_territorial, nome FROM territorio "
            "WHERE nivel = 'distrito' ORDER BY nome"
        )
        return cur.fetchall()


@router.get(
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
        raise HTTPException(503, "Malha territorial indisponível.")
    return JSONResponse(fc, media_type="application/geo+json")
