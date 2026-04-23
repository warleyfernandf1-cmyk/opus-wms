from fastapi import APIRouter
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
