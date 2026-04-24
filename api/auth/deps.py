from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from api.auth.jwt import verificar_token
from api.db.client import get_db

_bearer = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer),
) -> dict:
    """
    Valida o JWT e garante que o usuário ainda está ativo no banco.
    Injetada em todos os endpoints protegidos.
    """
    payload = verificar_token(credentials.credentials)

    db = get_db()
    rows = (
        db.table("usuarios")
        .select("id,nome,email,role,ativo")
        .eq("id", payload["sub"])
        .execute()
        .data
    )
    if not rows or not rows[0]["ativo"]:
        raise HTTPException(401, "Usuário inativo ou não encontrado.")

    return rows[0]


def requer_role(*roles: str):
    """
    Fábrica de dependências de autorização por papel.
    Uso: Depends(requer_role("admin", "planejador"))
    """
    def dep(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(
                403,
                f"Permissão insuficiente. Requerido: {', '.join(roles)}.",
            )
        return user
    return dep
