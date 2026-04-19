"""
Regras de negócio da Recepção.
- ID único: nunca repete numeração.
- Conflito → sufixo A-1, A-2, etc.
- Rollback é a única forma de excluir um pallet do sistema.
"""
import re
from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db
from api.models.schemas import PalletCreate


def _gerar_id(nro_pallet: str, db) -> str:
    base = nro_pallet.strip()
    existing = db.table("pallets").select("id").like("id", f"{base}%").execute().data
    ids = {r["id"] for r in existing}

    if base not in ids:
        return base

    counter = 1
    while True:
        candidate = f"{base}-A-{counter}"
        if candidate not in ids:
            return candidate
        counter += 1


def registrar(body: PalletCreate) -> dict:
    db = get_db()
    pallet_id = _gerar_id(body.nro_pallet, db)
    is_adicao = "-A-" in pallet_id

    now = datetime.utcnow().isoformat()
    row = {
        "id": pallet_id,
        **body.model_dump(),
        "data_embalamento": body.data_embalamento.isoformat(),
        "fase": "recepcao",
        "is_adicao": is_adicao,
        "created_at": now,
        "updated_at": now,
    }
    db.table("pallets").insert(row).execute()

    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "recepcao",
        "fase_nova": "recepcao",
        "dados": {"is_adicao": is_adicao},
        "created_at": now,
    }).execute()

    return db.table("pallets").select("*").eq("id", pallet_id).execute().data[0]


def listar() -> list:
    db = get_db()
    return db.table("pallets").select("*").eq("fase", "recepcao").order("created_at", desc=True).execute().data


def buscar(pallet_id: str) -> dict | None:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    return rows[0] if rows else None


def rollback(pallet_id: str) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado")
    pallet = rows[0]
    if pallet["fase"] != "recepcao":
        raise HTTPException(400, f"Rollback na recepção só é possível para pallets na fase 'recepcao'. Fase atual: {pallet['fase']}")

    db.table("pallets").delete().eq("id", pallet_id).execute()
    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "rollback_recepcao",
        "fase_anterior": "recepcao",
        "dados": {"motivo": "exclusão via rollback"},
        "created_at": datetime.utcnow().isoformat(),
    }).execute()

    return {"ok": True, "pallet_id": pallet_id, "mensagem": "Pallet excluído com sucesso."}
