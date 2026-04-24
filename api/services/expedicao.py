from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db
from api.models.schemas import OrdemExpedicaoCreate


def _next_oe_id(db) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"OE-{today}-"
    rows = db.table("ordens_expedicao").select("id").like("id", f"{prefix}%").execute().data
    nums = [int(r["id"].split("-")[-1]) for r in rows if r["id"].split("-")[-1].isdigit()]
    return f"{prefix}{max(nums, default=0) + 1:03d}"


def criar_ordem(body: OrdemExpedicaoCreate, user_id: str | None = None) -> dict:
    db = get_db()
    now = datetime.utcnow().isoformat()
    oe_id = _next_oe_id(db)

    for pallet_id in body.pallet_ids:
        rows = db.table("pallets").select("fase").eq("id", pallet_id).execute().data
        if not rows:
            raise HTTPException(404, f"Pallet {pallet_id} não encontrado")
        if rows[0]["fase"] != "picking":
            raise HTTPException(400, f"Pallet {pallet_id} não está na fase picking")

    db.table("ordens_expedicao").insert({
        "id": oe_id,
        "pallet_ids": body.pallet_ids,
        "status": "pendente",
        "criada_em": now,
    }).execute()
    return db.table("ordens_expedicao").select("*").eq("id", oe_id).execute().data[0]


def listar_ordens() -> list:
    return get_db().table("ordens_expedicao").select("*").order("criada_em", desc=True).execute().data


def executar_ordem(oe_id: str, user_id: str | None = None) -> dict:
    db = get_db()
    rows = db.table("ordens_expedicao").select("*").eq("id", oe_id).execute().data
    if not rows:
        raise HTTPException(404, "OE não encontrada")
    oe = rows[0]
    if oe["status"] != "pendente":
        raise HTTPException(400, f"OE já está {oe['status']}")

    now = datetime.utcnow().isoformat()
    for pallet_id in oe["pallet_ids"]:
        db.table("pallets").update({"fase": "expedido", "updated_at": now}).eq("id", pallet_id).execute()
        db.table("historico").insert({
            "pallet_id": pallet_id,
            "acao": "expedicao",
            "fase_anterior": "picking",
            "fase_nova": "expedido",
            "dados": {"oe_id": oe_id},
            "usuario": user_id,
            "created_at": now,
        }).execute()

    db.table("ordens_expedicao").update({"status": "executada", "executada_em": now}).eq("id", oe_id).execute()
    return {"ok": True, "oe_id": oe_id}
