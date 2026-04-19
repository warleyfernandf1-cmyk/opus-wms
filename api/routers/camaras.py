from fastapi import APIRouter
from api.db.client import get_db

router = APIRouter()

# Câmara 01: gap no corredor posições 7 e 8 (Porta)
# Câmara 02: gap no corredor posições 12 e 13 (Porta)
GAPS = {
    "01": {7, 8},
    "02": {12, 13},
}


@router.get("/")
def mapa_camaras():
    db = get_db()
    posicoes = db.table("posicoes_camara").select("*").execute().data
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
    return {"camara": camara_id, "posicoes": posicoes, "gaps": list(GAPS.get(camara_id, set()))}
