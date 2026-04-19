"""
Regras de negócio do Picking.
- Ao criar OP: bloqueia (reserva_picking) as posições dos pallets selecionados.
- Nenhum outro módulo pode ocupar posições reservadas até a OP ser executada/cancelada.
- Cancelar OP libera todas as reservas.
"""
from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db
from api.models.schemas import OrdemPickingCreate


def _next_op_id(db) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"OP-{today}-"
    rows = db.table("ordens_picking").select("id").like("id", f"{prefix}%").execute().data
    nums = [int(r["id"].split("-")[-1]) for r in rows if r["id"].split("-")[-1].isdigit()]
    return f"{prefix}{max(nums, default=0) + 1:03d}"


def criar_ordem(body: OrdemPickingCreate) -> dict:
    db = get_db()
    now = datetime.utcnow().isoformat()
    op_id = _next_op_id(db)

    posicoes_reservadas = []
    for pallet_id in body.pallet_ids:
        rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
        if not rows:
            raise HTTPException(404, f"Pallet {pallet_id} não encontrado")
        p = rows[0]
        if p["fase"] != "armazenamento":
            raise HTTPException(400, f"Pallet {pallet_id} não está em armazenamento")
        if not (p.get("camara") and p.get("rua") and p.get("posicao")):
            raise HTTPException(400, f"Pallet {pallet_id} não possui posição de câmara definida")

        pos_id = f"C{p['camara']}-R{p['rua']:02d}-P{p['posicao']:02d}"
        pos_rows = db.table("posicoes_camara").select("*").eq("id", pos_id).execute().data
        if pos_rows and pos_rows[0]["status"] != "ocupada":
            raise HTTPException(400, f"Posição {pos_id} não está com status 'ocupada'")

        db.table("posicoes_camara").update({
            "status": "reservada_picking",
            "reserva_id": op_id,
        }).eq("id", pos_id).execute()
        posicoes_reservadas.append(pos_id)

    db.table("ordens_picking").insert({
        "id": op_id,
        "pallet_ids": body.pallet_ids,
        "status": "pendente",
        "criada_em": now,
        "observacoes": body.observacoes,
        "posicoes": posicoes_reservadas,
    }).execute()

    db.table("historico").insert({
        "acao": "picking_criacao",
        "dados": {"op_id": op_id, "pallet_ids": body.pallet_ids},
        "created_at": now,
    }).execute()

    return db.table("ordens_picking").select("*").eq("id", op_id).execute().data[0]


def listar_ordens() -> list:
    return get_db().table("ordens_picking").select("*").order("criada_em", desc=True).execute().data


def buscar_ordem(op_id: str) -> dict | None:
    rows = get_db().table("ordens_picking").select("*").eq("id", op_id).execute().data
    return rows[0] if rows else None


def executar_ordem(op_id: str) -> dict:
    db = get_db()
    rows = db.table("ordens_picking").select("*").eq("id", op_id).execute().data
    if not rows:
        raise HTTPException(404, "OP não encontrada")
    op = rows[0]
    if op["status"] != "pendente":
        raise HTTPException(400, f"OP já está {op['status']}")

    now = datetime.utcnow().isoformat()
    for pallet_id in op["pallet_ids"]:
        p_rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
        if p_rows:
            p = p_rows[0]
            pos_id = f"C{p['camara']}-R{p['rua']:02d}-P{p['posicao']:02d}"
            db.table("posicoes_camara").update({"status": "livre", "pallet_id": None, "reserva_id": None}).eq("id", pos_id).execute()
            db.table("pallets").update({"fase": "picking", "updated_at": now}).eq("id", pallet_id).execute()
            db.table("historico").insert({
                "pallet_id": pallet_id,
                "acao": "picking_execucao",
                "fase_anterior": "armazenamento",
                "fase_nova": "picking",
                "dados": {"op_id": op_id},
                "created_at": now,
            }).execute()

    db.table("ordens_picking").update({"status": "executada", "executada_em": now}).eq("id", op_id).execute()
    return {"ok": True, "op_id": op_id}


def cancelar_ordem(op_id: str) -> dict:
    db = get_db()
    rows = db.table("ordens_picking").select("*").eq("id", op_id).execute().data
    if not rows:
        raise HTTPException(404, "OP não encontrada")
    op = rows[0]
    if op["status"] != "pendente":
        raise HTTPException(400, f"OP não pode ser cancelada (status: {op['status']})")

    now = datetime.utcnow().isoformat()
    for pos_id in op.get("posicoes", []):
        db.table("posicoes_camara").update({"status": "ocupada", "reserva_id": None}).eq("id", pos_id).execute()

    db.table("ordens_picking").update({"status": "cancelada"}).eq("id", op_id).execute()
    db.table("historico").insert({
        "acao": "picking_cancelamento",
        "dados": {"op_id": op_id},
        "created_at": now,
    }).execute()
    return {"ok": True, "op_id": op_id, "posicoes_liberadas": op.get("posicoes", [])}
