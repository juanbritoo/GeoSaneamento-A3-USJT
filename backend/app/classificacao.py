"""Classificação do nível de saneamento a partir das respostas do questionário.

Critério (ajustável aqui, sem tocar no resto da API):

* Cada resposta vale de 0 (pior cenário) a PONTOS_MAXIMOS (melhor cenário).
* "Não sei informar" vale None e fica fora do cálculo: a pontuação é calculada
  só sobre as perguntas respondidas, para não punir nem premiar quem não sabe.
* A pontuação final é normalizada de 0 a 100 e convertida em um nível.

As chaves de PONTOS são os campos do corpo da requisição e os textos das opções
são exatamente os exibidos no Questionario.jsx (a API valida contra eles).
"""

from typing import Literal, Optional, get_args

NivelSaneamento = Literal["critico", "precario", "regular", "adequado"]
NIVEIS: tuple[str, ...] = get_args(NivelSaneamento)

PONTOS_MAXIMOS = 4

# (pontuação mínima, nível), do melhor para o pior. Ex.: 80 ou mais = adequado.
LIMITES_NIVEL: tuple[tuple[int, NivelSaneamento], ...] = (
    (80, "adequado"),
    (60, "regular"),
    (40, "precario"),
    (0, "critico"),
)

PONTOS: dict[str, dict[str, Optional[int]]] = {
    "abastecimento": {  # Sua região sofre com falta de água?
        "Sim, frequentemente": 0,
        "Às vezes": 2,
        "Raramente": 3,
        "Não, nunca": 4,
    },
    "esgoto": {  # Já presenciou esgoto a céu aberto na sua rua?
        "Sim, frequentemente": 0,
        "Sim, algumas vezes": 1,
        "Raramente": 3,
        "Não": 4,
    },
    "abastecimento_fonte": {  # Principal fonte de água da residência
        "Rede pública de abastecimento": 4,
        "Poço artesiano": 2,
        "Nascente": 2,
        "Caminhão-pipa": 1,
        "Outra fonte": 1,
        "Não sei informar": None,
    },
    "esgoto_destino": {  # Destino do esgoto da residência
        "Rede pública de esgoto": 4,
        "Fossa séptica": 3,
        "Fossa rudimentar": 1,
        "Despejo em rios ou córregos": 0,
        "Não sei informar": None,
    },
    "avaliacao": {  # Avaliação do saneamento do bairro
        "Muito bom": 4,
        "Bom": 3,
        "Regular": 2,
        "Ruim": 1,
        "Muito ruim": 0,
    },
}


def calcular_pontuacao(respostas: dict[str, str]) -> float:
    """Retorna a pontuação de 0 a 100 (duas casas decimais).

    Levanta ValueError se faltar pergunta, sobrar pergunta, houver opção inválida
    ou se nenhuma pergunta puder ser pontuada.
    """
    esperadas, recebidas = set(PONTOS), set(respostas)
    if esperadas != recebidas:
        raise ValueError(
            f"Perguntas ausentes: {sorted(esperadas - recebidas)}; "
            f"desconhecidas: {sorted(recebidas - esperadas)}."
        )

    obtidos = 0
    respondidas = 0
    for pergunta, opcao in respostas.items():
        if opcao not in PONTOS[pergunta]:
            raise ValueError(f"Opção inválida para '{pergunta}': {opcao!r}.")
        pontos = PONTOS[pergunta][opcao]
        if pontos is None:  # "Não sei informar"
            continue
        obtidos += pontos
        respondidas += 1

    if respondidas == 0:
        raise ValueError("Nenhuma resposta pontuável.")

    return round(obtidos / (respondidas * PONTOS_MAXIMOS) * 100, 2)


def classificar(pontuacao: float) -> NivelSaneamento:
    """Converte a pontuação (0 a 100) em nível de saneamento."""
    if not 0 <= pontuacao <= 100:
        raise ValueError("A pontuação deve estar entre 0 e 100.")
    for minimo, nivel in LIMITES_NIVEL:
        if pontuacao >= minimo:
            return nivel
    raise AssertionError("LIMITES_NIVEL deve terminar em 0.")  # pragma: no cover
