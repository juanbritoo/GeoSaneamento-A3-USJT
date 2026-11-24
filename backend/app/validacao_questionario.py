"""Regras complementares do questionario participativo."""

CAMPOS_DOMICILIARES = (
    "abastecimento_agua_rede_geral",
    "esgotamento_sanitario_rede_geral",
    "destino_lixo_coleta_direta",
    "existencia_banheiro_exclusivo",
    "falta_agua_30_dias",
    "regularidade_agua",
    "qualidade_agua_percebida",
)


def normalizar_comentario(value):
    if isinstance(value, str):
        if len(value) > 500:
            raise ValueError("Comentario deve ter no maximo 500 caracteres.")
        return value.strip() or None
    return value


def validar_respostas_v2(vinculo_territorial, respostas):
    if vinculo_territorial in ("trabalha_estuda", "sem_vinculo_frequente"):
        invalidos = [campo for campo in CAMPOS_DOMICILIARES if getattr(respostas, campo) is not None]
        if invalidos:
            raise ValueError("Nao moradores devem informar null em: " + ", ".join(invalidos))
    else:
        ausentes = [campo for campo in CAMPOS_DOMICILIARES[:5] if getattr(respostas, campo) is None]
        if ausentes:
            raise ValueError("Moradores devem responder: " + ", ".join(ausentes))
