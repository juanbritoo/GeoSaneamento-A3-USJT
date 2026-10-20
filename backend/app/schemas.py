from typing import Any, Literal, Optional

from pydantic import BaseModel


class ErroAPI(BaseModel):
    detail: str


class HealthResponse(BaseModel):
    status: Literal["ok"]
    database: str
    database_status: Literal["connected"]


class DistritoResumo(BaseModel):
    id_territorial: str
    nome: str


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
