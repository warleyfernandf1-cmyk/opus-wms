from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db
from api.models.schemas import InventarioItemRegistro


def iniciar() -> dict:
    db = get_db()
    ativos = db.table("inventarios").select("id").eq("status", "em_andamento").execute().data
    if ativos:
        raise HTTPException(400, "Já existe um inventário em andamento.")

    now = datetime.utcnow().isoformat()
    pallets = db.table("pallets").select("id,qtd_caixas").eq("fase", "armazenamento").execute().data

    inv_row = {"iniciado_em": now, "status": "em_andamento"}
    inv = db.table("inventarios").insert(inv_row).execute().data[0]

    for p in pallets:
        db.table("itens_inventario").insert({
            "inventario_id": inv["id"],
            "pallet_id": p["id"],
            "qtd_sistema": p["qtd_caixas"],
            "contado": False,
        }).execute()

    return inv


def listar() -> list:
    return get_db().table("inventarios").select("*").order("iniciado_em", desc=True).execute().data


def registrar_item(inventario_id: str, body: InventarioItemRegistro) -> dict:
    db = get_db()
    rows = db.table("itens_inventario").select("*").eq("inventario_id", inventario_id).eq("pallet_id", body.pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Item não encontrado no inventário")

    db.table("itens_inventario").update({
        "qtd_contada": body.qtd_contada,
        "divergencia": rows[0]["qtd_sistema"] - body.qtd_contada,
        "contado": True,
    }).eq("inventario_id", inventario_id).eq("pallet_id", body.pallet_id).execute()

    return {"ok": True}


def finalizar(inventario_id: str) -> dict | None:
    db = get_db()
    rows = db.table("inventarios").select("*").eq("id", inventario_id).execute().data
    if not rows:
        return None
    inv = rows[0]
    if inv["status"] == "finalizado":
        raise HTTPException(400, "Inventário já finalizado")

    itens = db.table("itens_inventario").select("*").eq("inventario_id", inventario_id).execute().data
    total = len(itens)
    corretos = len([i for i in itens if i.get("divergencia", 0) == 0 and i.get("contado")])
    acuracidade = round((corretos / total * 100) if total else 0, 2)

    now = datetime.utcnow().isoformat()
    db.table("inventarios").update({
        "status": "finalizado",
        "finalizado_em": now,
        "acuracidade": acuracidade,
    }).eq("id", inventario_id).execute()

    db.table("relatorios").insert({
        "modulo": "inventario",
        "titulo": f"Inventário {inventario_id} — Acuracidade {acuracidade}%",
        "dados": {"total": total, "corretos": corretos, "acuracidade": acuracidade},
        "inicio_execucao": inv["iniciado_em"],
        "fim_execucao": now,
        "created_at": now,
    }).execute()

    return db.table("inventarios").select("*").eq("id", inventario_id).execute().data[0]
