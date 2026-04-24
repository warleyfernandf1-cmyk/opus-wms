import os
import jwt
from datetime import datetime, timedelta, timezone
from fastapi import HTTPException

_SECRET    = None
ALGORITHM  = "HS256"


def _secret() -> str:
    global _SECRET
    if _SECRET is None:
        _SECRET = os.environ["JWT_SECRET"]
        if len(_SECRET) < 32:
            raise RuntimeError("JWT_SECRET muito curto. Use ao menos 32 caracteres.")
    return _SECRET


def criar_token(user: dict) -> str:
    expiry_h = int(os.getenv("JWT_EXPIRY_H", "8"))
    now = datetime.now(timezone.utc)
    payload = {
        "sub":  str(user["id"]),
        "nome": user["nome"],
        "role": user["role"],
        "iat":  now,
        "exp":  now + timedelta(hours=expiry_h),
    }
    return jwt.encode(payload, _secret(), algorithm=ALGORITHM)


def verificar_token(token: str) -> dict:
    try:
        return jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Sessão expirada. Faça login novamente.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Token inválido.")
