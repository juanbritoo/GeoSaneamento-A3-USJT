import os
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pwdlib import PasswordHash

from .db import cursor

JWT_SECRET = os.getenv("JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRA_MINUTOS = int(os.getenv("JWT_EXPIRA_MINUTOS", "60"))

# HS256 exige chave com pelo menos 256 bits (32 bytes). Falhar cedo evita subir a API insegura.
if len(JWT_SECRET) < 32:
    raise RuntimeError("Defina JWT_SECRET com pelo menos 32 caracteres (veja backend/.env).")

# PasswordHash.recommended() usa Argon2 (com sal aleatório embutido no hash).
_hasher = PasswordHash.recommended()

# Hash descartável: permite gastar o mesmo tempo quando o e-mail não existe,
# para o login não revelar quais e-mails estão cadastrados pelo tempo de resposta.
HASH_FICTICIO = _hasher.hash("senha-ficticia-apenas-para-equalizar-tempo")

_esquema_bearer = HTTPBearer(auto_error=False)


def gerar_hash_senha(senha: str) -> str:
    return _hasher.hash(senha)


def verificar_senha(senha: str, senha_hash: str) -> bool:
    return _hasher.verify(senha, senha_hash)


def criar_token(id_usuario: int) -> str:
    agora = datetime.now(timezone.utc)
    payload = {
        "sub": str(id_usuario),
        "iat": agora,
        "exp": agora + timedelta(minutes=JWT_EXPIRA_MINUTOS),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _nao_autenticado() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Sessão inválida ou expirada. Entre novamente.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def obter_usuario_atual(
    credenciais: HTTPAuthorizationCredentials | None = Depends(_esquema_bearer),
) -> dict:
    """Dependência para rotas exclusivas de usuário cadastrado."""
    if credenciais is None:
        raise _nao_autenticado()

    try:
        payload = jwt.decode(
            credenciais.credentials,
            JWT_SECRET,
            algorithms=[JWT_ALGORITHM],
            options={"require": ["exp", "sub"]},
        )
        id_usuario = int(payload["sub"])
    except (jwt.InvalidTokenError, ValueError):
        raise _nao_autenticado()

    with cursor() as cur:
        cur.execute(
            "SELECT id_usuario, nome, email FROM usuario WHERE id_usuario = %s AND ativo",
            (id_usuario,),
        )
        usuario = cur.fetchone()

    if usuario is None:
        raise _nao_autenticado()
    return usuario