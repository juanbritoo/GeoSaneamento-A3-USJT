from fastapi import APIRouter

from ..db import cursor
from ..schemas import ErroAPI, HealthResponse

router = APIRouter()


@router.get(
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
