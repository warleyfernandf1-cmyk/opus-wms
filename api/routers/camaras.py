from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from api.db.client import get_db

router = APIRouter()

# Câmara 01: gap no corredor posições 7 e 8 (Porta)
# Câmara 02: gap no corredor posições 12 e 13 (Porta)
GAPS = {
    "01": {7, 8},
    "02": {12, 13},
}


def _enriquecer(posicoes: list, db) -> list:
    """Busca os dados do pallet para cada posição ocupada e injeta inline."""
    pallet_ids = [p["pallet_id"] for p in posicoes if p.get("pallet_id")]
    if not pallet_ids:
        return posicoes

    pallets_raw = (
        db.table("pallets")
        .select("id, variedade, classificacao, qtd_caixas, produtor, data_embalamento, peso")
        .in_("id", pallet_ids)
        .execute()
        .data
    )
    pallets_map = {p["id"]: p for p in pallets_raw}

    for pos in posicoes:
        pid = pos.get("pallet_id")
        if pid and pid in pallets_map:
            pos["pallet"] = pallets_map[pid]

    return posicoes


@router.get("/")
def mapa_camaras():
    db = get_db()
    posicoes = db.table("posicoes_camara").select("*").execute().data
    posicoes = _enriquecer(posicoes, db)
    resultado = {"01": [], "02": []}
    for p in posicoes:
        resultado[p["camara"]].append(p)
    return resultado


class MoverPalletIn(BaseModel):
    posicao_origem_id: str
    posicao_destino_id: str


@router.post("/mover")
def mover_pallet(body: MoverPalletIn):
    if body.posicao_origem_id == body.posicao_destino_id:
        raise HTTPException(400, "Origem e destino são a mesma posição")

    db = get_db()

    # Validar origem
    orig_rows = db.table("posicoes_camara").select("*").eq("id", body.posicao_origem_id).execute().data
    if not orig_rows:
        raise HTTPException(400, "Posição de origem não encontrada")
    origem = orig_rows[0]
    if origem.get("is_gap"):
        raise HTTPException(400, "Posição de origem é um gap")
    if origem["status"] != "ocupada" or not origem.get("pallet_id"):
        raise HTTPException(400, "Posição de origem não está ocupada")

    pallet_id = origem["pallet_id"]

    # Validar destino
    dest_rows = db.table("posicoes_camara").select("*").eq("id", body.posicao_destino_id).execute().data
    if not dest_rows:
        raise HTTPException(400, "Posição de destino não encontrada")
    destino = dest_rows[0]
    if destino.get("is_gap"):
        raise HTTPException(400, "Posição de destino é um gap")
    if destino["status"] != "livre":
        raise HTTPException(400, f"Posição de destino não está livre (status: {destino['status']})")

    # Validar fase do pallet
    pallet_rows = db.table("pallets").select("id, fase").eq("id", pallet_id).execute().data
    if not pallet_rows:
        raise HTTPException(400, "Pallet não encontrado")
    if pallet_rows[0]["fase"] != "armazenamento":
        raise HTTPException(400, f"Pallet não está em armazenamento (fase: {pallet_rows[0]['fase']})")

    # Mover: liberar origem, ocupar destino, atualizar pallet
    db.table("posicoes_camara").update({"status": "livre", "pallet_id": None}).eq("id", body.posicao_origem_id).execute()
    db.table("posicoes_camara").update({"status": "ocupada", "pallet_id": pallet_id}).eq("id", body.posicao_destino_id).execute()
    db.table("pallets").update({
        "camara":  destino["camara"],
        "rua":     destino["rua"],
        "posicao": destino["posicao"],
    }).eq("id", pallet_id).execute()

    return {"ok": True, "pallet_id": pallet_id, "destino": body.posicao_destino_id}


@router.get("/{camara_id}")
def mapa_camara(camara_id: str):
    db = get_db()
    posicoes = (
        db.table("posicoes_camara")
        .select("*")
        .eq("camara", camara_id)
        .order("rua")
        .order("posicao")
        .execute()
        .data
    )
    posicoes = _enriquecer(posicoes, db)
    return {
        "camara": camara_id,
        "posicoes": posicoes,
        "gaps": list(GAPS.get(camara_id, set())),
    }
