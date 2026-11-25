from typing import Any, Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


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


class CadastroEntrada(BaseModel):
    nome: str = Field(min_length=2, max_length=100)
    email: EmailStr
    senha: str = Field(min_length=8, max_length=128)

    @field_validator("nome")
    @classmethod
    def nome_sem_espacos_nas_pontas(cls, valor: str) -> str:
        valor = valor.strip()
        if len(valor) < 2:
            raise ValueError("O nome deve ter pelo menos 2 caracteres.")
        return valor


class LoginEntrada(BaseModel):
    email: EmailStr
    senha: str = Field(min_length=1, max_length=128)


class UsuarioSaida(BaseModel):
    id_usuario: int
    nome: str
    email: str


class TokenResposta(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    usuario: UsuarioSaida