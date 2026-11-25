from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.errors import UniqueViolation

from ..db import cursor
from ..schemas import CadastroEntrada, ErroAPI, LoginEntrada, TokenResposta, UsuarioSaida
from ..security import (
    HASH_FICTICIO,
    criar_token,
    gerar_hash_senha,
    obter_usuario_atual,
    verificar_senha,
)

router = APIRouter(prefix="/auth", tags=["Autenticação"])


@router.post(
    "/cadastro",
    response_model=TokenResposta,
    status_code=status.HTTP_201_CREATED,
    responses={409: {"model": ErroAPI, "description": "E-mail já cadastrado."}},
)
def cadastrar(dados: CadastroEntrada):
    email = dados.email.lower()
    senha_hash = gerar_hash_senha(dados.senha)

    try:
        with cursor() as cur:
            cur.execute(
                "INSERT INTO usuario (nome, email, senha_hash) VALUES (%s, %s, %s) "
                "RETURNING id_usuario, nome, email",
                (dados.nome, email, senha_hash),
            )
            usuario = cur.fetchone()
    except UniqueViolation:
        raise HTTPException(status.HTTP_409_CONFLICT, "Este e-mail já está cadastrado.")

    # O cidadão já entra logado depois de se cadastrar.
    return {"access_token": criar_token(usuario["id_usuario"]), "usuario": usuario}


@router.post(
    "/login",
    response_model=TokenResposta,
    responses={401: {"model": ErroAPI, "description": "E-mail ou senha inválidos."}},
)
def entrar(dados: LoginEntrada):
    email = dados.email.lower()

    with cursor() as cur:
        cur.execute(
            "SELECT id_usuario, nome, email, senha_hash FROM usuario "
            "WHERE lower(email) = %s AND ativo",
            (email,),
        )
        registro = cur.fetchone()

    # Sempre verifica um hash (o fictício, se o e-mail não existe) para igualar o tempo.
    senha_valida = verificar_senha(
        dados.senha, registro["senha_hash"] if registro else HASH_FICTICIO
    )
    if registro is None or not senha_valida:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "E-mail ou senha inválidos.")

    usuario = {k: registro[k] for k in ("id_usuario", "nome", "email")}
    return {"access_token": criar_token(usuario["id_usuario"]), "usuario": usuario}


@router.get(
    "/me",
    response_model=UsuarioSaida,
    responses={401: {"model": ErroAPI, "description": "Sessão inválida ou expirada."}},
)
def perfil(usuario: dict = Depends(obter_usuario_atual)):
    return usuario