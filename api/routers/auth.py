from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel
from typing import Optional
from api.auth.deps import get_current_user, requer_role
from api.services import auth as svc

router = APIRouter()


class LoginIn(BaseModel):
    email: str
    senha: str


class UsuarioCreate(BaseModel):
    nome:  str
    email: str
    senha: str
    role:  str = "operador"


class UsuarioUpdate(BaseModel):
    nome: Optional[str] = None
    role: Optional[str] = None


class RedefinirSenhaIn(BaseModel):
    nova_senha: str


# ── Públicos ──────────────────────────────────────────────────

@router.post("/login")
def login(body: LoginIn, request: Request):
    return svc.login(body.email, body.senha, request)


# ── Autenticados ──────────────────────────────────────────────

@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return user


# ── Admin ─────────────────────────────────────────────────────

@router.get("/usuarios", dependencies=[Depends(requer_role("admin"))])
def listar_usuarios():
    return svc.listar_usuarios()


@router.post("/usuarios", dependencies=[Depends(requer_role("admin"))], status_code=201)
def criar_usuario(body: UsuarioCreate):
    return svc.criar_usuario(body.nome, body.email, body.senha, body.role)


@router.put("/usuarios/{usuario_id}", dependencies=[Depends(requer_role("admin"))])
def atualizar_usuario(usuario_id: str, body: UsuarioUpdate):
    return svc.atualizar_usuario(usuario_id, body.nome, body.role)


@router.post("/usuarios/{usuario_id}/desativar")
def desativar_usuario(
    usuario_id: str,
    user: dict = Depends(requer_role("admin")),
):
    return svc.desativar_usuario(usuario_id, admin_id=user["id"])


@router.post("/usuarios/{usuario_id}/reativar", dependencies=[Depends(requer_role("admin"))])
def reativar_usuario(usuario_id: str):
    return svc.reativar_usuario(usuario_id)


@router.post("/usuarios/{usuario_id}/redefinir-senha", dependencies=[Depends(requer_role("admin"))])
def redefinir_senha(usuario_id: str, body: RedefinirSenhaIn):
    return svc.redefinir_senha(usuario_id, body.nova_senha)
