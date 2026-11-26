from datetime import datetime
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field

from .classificacao import PONTOS, NivelSaneamento


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


# Cada Literal abaixo é montado a partir de classificacao.PONTOS, que é a única
# fonte das opções válidas (assim o Swagger lista os valores aceitos).
OpcaoAbastecimento = Literal[tuple(PONTOS["abastecimento"])]  # type: ignore[valid-type]
OpcaoEsgoto = Literal[tuple(PONTOS["esgoto"])]  # type: ignore[valid-type]
OpcaoAbastecimentoFonte = Literal[tuple(PONTOS["abastecimento_fonte"])]  # type: ignore[valid-type]
OpcaoEsgotoDestino = Literal[tuple(PONTOS["esgoto_destino"])]  # type: ignore[valid-type]
OpcaoAvaliacao = Literal[tuple(PONTOS["avaliacao"])]  # type: ignore[valid-type]


class RespostasQuestionario(BaseModel):
    model_config = ConfigDict(extra="forbid")

    abastecimento: OpcaoAbastecimento
    esgoto: OpcaoEsgoto
    abastecimento_fonte: OpcaoAbastecimentoFonte
    esgoto_destino: OpcaoEsgotoDestino
    avaliacao: OpcaoAvaliacao


class QuestionarioEntrada(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id_territorial: str = Field(
        pattern=r"^[0-9]{9}$",
        description="Código IBGE (9 dígitos) do distrito escolhido no mapa.",
        examples=["355030801"],
    )
    respostas: RespostasQuestionario


class QuestionarioResposta(BaseModel):
    id: int
    id_territorial: str
    nome_territorio: str
    # dict (e não RespostasQuestionario) para a leitura não quebrar se as
    # opções do questionário mudarem no futuro e houver registros antigos.
    respostas: dict[str, str]
    pontuacao: float
    nivel_saneamento: NivelSaneamento
    criado_em: datetime


class QuestionarioLista(BaseModel):
    total: int
    limite: int
    deslocamento: int
    itens: list[QuestionarioResposta]
