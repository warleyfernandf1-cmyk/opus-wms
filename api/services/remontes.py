"""
Regras de negócio dos Remontes.
- Complementação: pallet original + pallet adição (sufixo A). Resulta no ID original.
- Junção: dois pallets distintos → novo ID "P1 | P2". Soma de caixas/peso.
- Entidades anteriores são extintas. Audit trail obrigatório.
"""
from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db


def complementacao(original_id: str, adicao_id: str) -> dict:
    db = get_db()
    orig_rows = db.table("pallets").select("*").eq("id", original_id).execute().data
    adic_rows = db.table("pallets").select("*").eq("id", adicao_id).execute().data

    if not orig_rows:
        raise HTTPException(404, f"Pallet original {original_id} não encontrado")
    if not adic_rows:
        raise HTTPException(404, f"Pallet de adição {adicao_id} não encontrado")

    orig = orig_rows[0]
    adic = adic_rows[0]

    if not adic.get("is_adicao"):
        raise HTTPException(400, f"Pallet {adicao_id} não é um pallet de adição (sufixo A)")

    now = datetime.utcnow().isoformat()
    nova_qtd  = orig["qtd_caixas"] + adic["qtd_caixas"]
    novo_peso = orig["peso"] + adic["peso"]

    db.table("pallets").update({
        "qtd_caixas": nova_qtd,
        "peso": novo_peso,
        "is_adicao": False,
        "updated_at": now,
    }).eq("id", original_id).execute()

    db.table("pallets").delete().eq("id", adicao_id).execute()

    db.table("historico").insert({
        "pallet_id": original_id,
        "acao": "remonte_complementacao",
        "dados": {
            "adicao_id": adicao_id,
            "qtd_anterior": orig["qtd_caixas"],
            "qtd_nova": nova_qtd,
        },
        "created_at": now,
    }).execute()

    return db.table("pallets").select("*").eq("id", original_id).execute().data[0]


def juncao(id1: str, id2: str) -> dict:
    db = get_db()
    rows1 = db.table("pallets").select("*").eq("id", id1).execute().data
    rows2 = db.table("pallets").select("*").eq("id", id2).execute().data

    if not rows1:
        raise HTTPException(404, f"Pallet {id1} não encontrado")
    if not rows2:
        raise HTTPException(404, f"Pallet {id2} não encontrado")

    p1, p2 = rows1[0], rows2[0]
    novo_id   = f"{id1} | {id2}"
    nova_qtd  = p1["qtd_caixas"] + p2["qtd_caixas"]
    novo_peso = p1["peso"] + p2["peso"]

    now = datetime.utcnow().isoformat()
    novo_pallet = {
        **p1,
        "id": novo_id,
        "nro_pallet": novo_id,
        "qtd_caixas": nova_qtd,
        "peso": novo_peso,
        "is_adicao": False,
        "created_at": now,
        "updated_at": now,
    }
    db.table("pallets").insert(novo_pallet).execute()
    db.table("pallets").delete().eq("id", id1).execute()
    db.table("pallets").delete().eq("id", id2).execute()

    db.table("historico").insert({
        "pallet_id": novo_id,
        "acao": "remonte_juncao",
        "dados": {"pallet_1": id1, "pallet_2": id2, "qtd_nova": nova_qtd},
        "created_at": now,
    }).execute()

    return db.table("pallets").select("*").eq("id", novo_id).execute().data[0]
