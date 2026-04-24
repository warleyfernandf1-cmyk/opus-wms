from datetime import datetime, timedelta, timezone
from fastapi import HTTPException, Request
from api.auth.hashing import hash_senha, verificar_senha
from api.auth.jwt import criar_token
from api.db.client import get_db

_MAX_TENTATIVAS = 5
_JANELA_MINUTOS = 15


def login(email: str, senha: str, request: Request) -> dict:
    db  = get_db()
    ip  = request.client.host if request.client else "unknown"
    now = datetime.now(timezone.utc)
    janela = (now - timedelta(minutes=_JANELA_MINUTOS)).isoformat()

    # Verifica bloqueio por tentativas excessivas
    falhas = (
        db.table("tentativas_login")
        .select("id")
        .eq("email", email)
        .eq("sucesso", False)
        .gte("tentativa_em", janela)
        .execute()
        .data
    )
    if len(falhas) >= _MAX_TENTATIVAS:
        raise HTTPException(
            429,
            f"Conta bloqueada temporariamente. Tente novamente em {_JANELA_MINUTOS} minutos.",
        )

    rows = db.table("usuarios").select("*").eq("email", email).execute().data
    usuario = rows[0] if rows else None

    # Valida senha — checkpw mesmo se usuário não existe (evita timing attack)
    dummy_hash = "$2b$12$invalidhashpaddinginvalidhash00"
    hash_alvo  = usuario["senha_hash"] if usuario else dummy_hash
    senha_ok   = verificar_senha(senha, hash_alvo) and usuario is not None

    db.table("tentativas_login").insert({
        "email":        email,
        "ip":           ip,
        "sucesso":      bool(senha_ok),
        "tentativa_em": now.isoformat(),
    }).execute()

    if not senha_ok:
        raise HTTPException(401, "Credenciais inválidas.")
    if not usuario["ativo"]:
        raise HTTPException(401, "Usuário inativo. Contate o administrador.")

    db.table("usuarios").update({"ultimo_acesso": now.isoformat()}).eq("id", usuario["id"]).execute()

    return {"access_token": criar_token(usuario), "token_type": "bearer"}


def listar_usuarios() -> list:
    return (
        get_db()
        .table("usuarios")
        .select("id,nome,email,role,ativo,ultimo_acesso,created_at")
        .order("nome")
        .execute()
        .data
    )


def criar_usuario(nome: str, email: str, senha: str, role: str) -> dict:
    db = get_db()
    existente = db.table("usuarios").select("id").eq("email", email).execute().data
    if existente:
        raise HTTPException(400, "E-mail já cadastrado.")

    roles_validos = {"admin", "planejador", "operador"}
    if role not in roles_validos:
        raise HTTPException(400, f"Role inválida. Use: {', '.join(roles_validos)}.")

    now = datetime.now(timezone.utc).isoformat()
    row = db.table("usuarios").insert({
        "nome":       nome,
        "email":      email,
        "senha_hash": hash_senha(senha),
        "role":       role,
        "ativo":      True,
        "created_at": now,
        "updated_at": now,
    }).execute().data[0]

    row.pop("senha_hash", None)
    return row


def atualizar_usuario(usuario_id: str, nome: str | None, role: str | None) -> dict:
    db = get_db()
    rows = db.table("usuarios").select("*").eq("id", usuario_id).execute().data
    if not rows:
        raise HTTPException(404, "Usuário não encontrado.")

    updates: dict = {"updated_at": datetime.now(timezone.utc).isoformat()}
    if nome is not None:
        updates["nome"] = nome
    if role is not None:
        roles_validos = {"admin", "planejador", "operador"}
        if role not in roles_validos:
            raise HTTPException(400, f"Role inválida. Use: {', '.join(roles_validos)}.")
        updates["role"] = role

    row = db.table("usuarios").update(updates).eq("id", usuario_id).execute().data[0]
    row.pop("senha_hash", None)
    return row


def desativar_usuario(usuario_id: str, admin_id: str) -> dict:
    if str(usuario_id) == str(admin_id):
        raise HTTPException(400, "Não é possível desativar a própria conta.")

    db = get_db()
    rows = db.table("usuarios").select("id,ativo").eq("id", usuario_id).execute().data
    if not rows:
        raise HTTPException(404, "Usuário não encontrado.")

    db.table("usuarios").update({
        "ativo":      False,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", usuario_id).execute()

    return {"ok": True, "usuario_id": usuario_id}


def reativar_usuario(usuario_id: str) -> dict:
    db = get_db()
    rows = db.table("usuarios").select("id").eq("id", usuario_id).execute().data
    if not rows:
        raise HTTPException(404, "Usuário não encontrado.")

    db.table("usuarios").update({
        "ativo":      True,
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", usuario_id).execute()

    return {"ok": True, "usuario_id": usuario_id}


def redefinir_senha(usuario_id: str, nova_senha: str) -> dict:
    db = get_db()
    rows = db.table("usuarios").select("id").eq("id", usuario_id).execute().data
    if not rows:
        raise HTTPException(404, "Usuário não encontrado.")

    db.table("usuarios").update({
        "senha_hash": hash_senha(nova_senha),
        "updated_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", usuario_id).execute()

    return {"ok": True}
