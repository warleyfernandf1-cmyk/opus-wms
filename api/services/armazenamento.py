"""
Regras de negócio do Armazenamento.
- 2 câmaras, 13 ruas × 6 posições + corredor (11 posições úteis).
- Posições ocupadas ou reservadas não aparecem como livres.
- Câmara 01: gap corredor pos 7-8 (Porta). Câmara 02: gap corredor pos 12-13 (Porta).
"""
from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db
from api.models.schemas import AlocarPalletIn

GAPS = {"01": {7, 8}, "02": {12, 13}}


def mapa_camaras() -> dict:
    db = get_db()
    posicoes = db.table("posicoes_camara").select("*").execute().data
    result: dict = {"01": [], "02": []}
    for p in posicoes:
        result[p["camara"]].append(p)
    return result


def posicoes_livres(camara: str | None = None) -> list:
    db = get_db()
    q = db.table("posicoes_camara").select("*").eq("status", "livre").eq("is_gap", False)
    if camara:
        q = q.eq("camara", camara)
    return q.execute().data


def listar_armazenados() -> list:
    db = get_db()
    return (
        db.table("pallets")
        .select("id,variedade,classificacao,qtd_caixas,camara,rua,posicao,updated_at")
        .eq("fase", "armazenamento")
        .order("updated_at", desc=True)
        .execute()
        .data
    )


def aguardando_alocacao() -> list:
    db = get_db()
    return (
        db.table("pallets")
        .select("id,nro_pallet,variedade,classificacao,produtor,tunel,boca,"
                "temp_entrada,temp_saida,qtd_caixas,fase,updated_at")
        .eq("fase", "armazenamento")
        .is_("camara", "null")
        .order("updated_at", desc=False)
        .execute()
        .data
    )


def alocar(body: AlocarPalletIn, user_id: str | None = None) -> dict:
    db = get_db()
    pos_id = f"C{body.camara}-R{body.rua:02d}-P{body.posicao:02d}"

    pos_rows = db.table("posicoes_camara").select("*").eq("id", pos_id).execute().data
    if not pos_rows:
        raise HTTPException(404, f"Posição {pos_id} não encontrada")
    pos = pos_rows[0]
    if pos["status"] != "livre":
        raise HTTPException(400, f"Posição {pos_id} não está livre (status: {pos['status']})")
    if pos["is_gap"]:
        raise HTTPException(400, "Posição inválida (gap/porta)")

    pallet_rows = db.table("pallets").select("*").eq("id", body.pallet_id).execute().data
    if not pallet_rows:
        raise HTTPException(404, "Pallet não encontrado")
    pallet = pallet_rows[0]
    if pallet["fase"] != "armazenamento":
        raise HTTPException(400, f"Pallet não está na fase armazenamento (fase: {pallet['fase']})")

    now = datetime.utcnow().isoformat()
    db.table("posicoes_camara").update({
        "status": "ocupada",
        "pallet_id": body.pallet_id,
    }).eq("id", pos_id).execute()

    db.table("pallets").update({
        "camara": body.camara,
        "rua": body.rua,
        "posicao": body.posicao,
        "updated_at": now,
    }).eq("id", body.pallet_id).execute()

    db.table("historico").insert({
        "pallet_id": body.pallet_id,
        "acao": "armazenamento_alocacao",
        "fase_anterior": "armazenamento",
        "fase_nova": "armazenamento",
        "dados": {"posicao": pos_id},
        "usuario": user_id,
        "created_at": now,
    }).execute()

    return {"ok": True, "pallet_id": body.pallet_id, "posicao": pos_id}


def rollback(pallet_id: str, user_id: str | None = None) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado")
    pallet = rows[0]
    if pallet["fase"] != "armazenamento":
        raise HTTPException(400, "Pallet não está em armazenamento")

    now = datetime.utcnow().isoformat()

    if pallet.get("camara") and pallet.get("rua") and pallet.get("posicao"):
        pos_id = f"C{pallet['camara']}-R{pallet['rua']:02d}-P{pallet['posicao']:02d}"
        db.table("posicoes_camara").update({"status": "livre", "pallet_id": None}).eq("id", pos_id).execute()

    db.table("pallets").update({
        "fase": "resfriamento",
        "camara": None,
        "rua": None,
        "posicao": None,
        "updated_at": now,
    }).eq("id", pallet_id).execute()

    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "rollback_armazenamento",
        "fase_anterior": "armazenamento",
        "fase_nova": "resfriamento",
        "usuario": user_id,
        "created_at": now,
    }).execute()

    return {"ok": True, "pallet_id": pallet_id}
