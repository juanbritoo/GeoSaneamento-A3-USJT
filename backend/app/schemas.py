from datetime import date, datetime
from enum import Enum
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .validacao_questionario import normalizar_comentario, validar_respostas_v2

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
    versao_questionario: Literal[1] = 1


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


class VinculoTerritorial(str, Enum):
    MORADOR_MAIS_1_ANO = "morador_mais_1_ano"
    MORADOR_MENOS_1_ANO = "morador_menos_1_ano"
    TRABALHA_ESTUDA = "trabalha_estuda"
    SEM_VINCULO_FREQUENTE = "sem_vinculo_frequente"


RespostaComparavel = Literal["sim", "nao", "nao_sei"]
NotaQuestionario = Annotated[int, Field(strict=True, ge=0, le=10)]


class RespostasQuestionarioV2(BaseModel):
    model_config = ConfigDict(extra="forbid")

    abastecimento_agua_rede_geral: RespostaComparavel | None
    esgotamento_sanitario_rede_geral: RespostaComparavel | None
    destino_lixo_coleta_direta: RespostaComparavel | None
    existencia_banheiro_exclusivo: RespostaComparavel | None
    falta_agua_30_dias: Literal["nenhum", "1_2", "3_7", "8_15", "mais_15", "nao_sei"] | None
    esgoto_ceu_aberto_30_dias: Literal["nunca", "uma_duas_vezes", "semanalmente", "diariamente", "nao_sei"]
    satisfacao_saneamento: Literal["muito_satisfeito", "satisfeito", "neutro", "insatisfeito", "muito_insatisfeito", "nao_sei"]
    regularidade_agua: NotaQuestionario | None
    qualidade_agua_percebida: NotaQuestionario | None
    condicoes_esgotamento: NotaQuestionario | None


class QuestionarioEntradaV2(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id_territorial: str = Field(pattern=r"^[0-9]{9}$")
    versao_questionario: Literal[2]
    vinculo_territorial: VinculoTerritorial
    respostas: RespostasQuestionarioV2
    comentario: str | None = Field(default=None, max_length=500)

    @field_validator("comentario", mode="before")
    @classmethod
    def limpar_comentario(cls, value):
        return normalizar_comentario(value)

    @model_validator(mode="after")
    def validar_vinculo(self):
        validar_respostas_v2(self.vinculo_territorial, self.respostas)
        return self


class QuestionarioItemV2(BaseModel):
    id: int
    id_territorial: str
    nome_territorio: str
    versao_questionario: Literal[2]
    vinculo_territorial: VinculoTerritorial
    respostas: RespostasQuestionarioV2
    criado_em: datetime


class QuestionarioRespostaV2(QuestionarioItemV2):
    comentario: str | None


class QuestionarioListaV2(BaseModel):
    total: int
    limite: int
    deslocamento: int
    itens: list[QuestionarioItemV2]


class PeriodoParticipativo(BaseModel):
    data_inicio: date | None
    data_fim: date | None
    fuso_horario: Literal["America/Sao_Paulo"] = "America/Sao_Paulo"


class ContadoresParticipativos(BaseModel):
    total_questionarios: int
    total_moradores: int
    total_nao_moradores: int
    total_vinculo_nao_informado: int
    total_comentarios: int


class IndicadorParticipativoPrincipal(BaseModel):
    codigo: Literal[
        "ABASTECIMENTO_AGUA_REDE_GERAL", "ESGOTAMENTO_SANITARIO_REDE_GERAL",
        "DESTINO_LIXO_COLETA_DIRETA", "EXISTENCIA_BANHEIRO_EXCLUSIVO",
    ]
    valor: float | None
    unidade: Literal["%"] = "%"
    total_sim: int
    total_nao: int
    total_nao_sei: int
    respostas_validas: int


class MediaParticipativa(BaseModel):
    campo: str
    valor: float | None
    unidade: Literal["nota_0_10"] = "nota_0_10"
    respostas_validas: int


class CategoriaParticipativa(BaseModel):
    codigo: str
    total: int
    percentual: float | None


class DistribuicaoParticipativa(BaseModel):
    campo: str
    respostas_validas: int
    total_nao_sei: int
    categorias: list[CategoriaParticipativa]


class PercentualParticipativo(BaseModel):
    codigo: str
    valor: float | None
    unidade: Literal["%"] = "%"
    total_favoravel: int
    respostas_validas: int


class ComplementaresParticipativos(BaseModel):
    medias: list[MediaParticipativa]
    distribuicoes: list[DistribuicaoParticipativa]
    percentuais: list[PercentualParticipativo]


class IndicadoresParticipativosResposta(BaseModel):
    territorio: DistritoResumo
    periodo: PeriodoParticipativo
    versao_questionario: Literal[2] = 2
    unidade_contagem: Literal["questionarios"] = "questionarios"
    contadores: ContadoresParticipativos
    principais: list[IndicadorParticipativoPrincipal]
    complementares: ComplementaresParticipativos


class ResumoDistritoParticipativo(BaseModel):
    territorio: DistritoResumo
    contadores: ContadoresParticipativos


class ResumoTerritorialParticipativo(BaseModel):
    periodo: PeriodoParticipativo
    versao_questionario: Literal[2] = 2
    unidade_contagem: Literal["questionarios"] = "questionarios"
    distritos: list[ResumoDistritoParticipativo]

StatusCorrelacao = Literal[
    'sem_dados', 'amostra_insuficiente', 'nao_comparavel', 'sem_alerta',
    'possivel_divergencia', 'divergencia_elevada',
]


class SimulacaoCorrelacao(BaseModel):
    divergencia_pp: float
    divergencia_absoluta_pp: float
    status_simulado: Literal['sem_alerta', 'possivel_divergencia', 'divergencia_elevada']


class IndicadorCorrelacao(BaseModel):
    codigo: str
    valor_oficial: float | None
    valor_participativo: float | None
    unidade: Literal['%']
    unidade_oficial: str | None
    respostas_validas: int
    primeira_resposta: date | None
    ultima_resposta: date | None
    divergencia_pp: float | None
    divergencia_absoluta_pp: float | None
    fonte: str | None
    periodo: str | None
    id_fonte: str | None
    procedencia: str | None
    classificacao_fonte: str | None
    is_mock: bool | None
    status: StatusCorrelacao
    motivo: str | None
    simulacao: SimulacaoCorrelacao | None


class ResumoCorrelacao(BaseModel):
    indicadores_comparados: int
    indicadores_divergentes: int
    divergencia_media_absoluta_pp: float | None
    maior_divergencia_absoluta_pp: float | None
    indicador_critico: str | None
    status: StatusCorrelacao
    exibir_alerta: bool


class ResumoCorrelacaoSimulada(ResumoCorrelacao):
    exibir_alerta: Literal[False] = False


class DistritoCorrelacao(BaseModel):
    id_territorial: str
    nome_territorio: str
    total_questionarios: int
    indicadores: list[IndicadorCorrelacao]
    resumo: ResumoCorrelacao
    resumo_simulado: ResumoCorrelacaoSimulada | None = None


class CorrelacaoResposta(BaseModel):
    periodo: PeriodoParticipativo
    periodo_oficial: str | None
    distritos: list[DistritoCorrelacao]
    aviso: str = ('Diferencas observadas em amostras voluntarias, nao comprovacao estatistica de irregularidades. '
                  'Questionarios nao representam pessoas ou domicilios unicos. Mesmo ano nao garante simultaneidade das coletas.')
