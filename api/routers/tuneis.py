from fastapi import APIRouter
from api.db.client import get_db

router = APIRouter()

# Layout: bocas 1-6 lado direito, 7-12 lado esquerdo, corredor central
BOCAS_DIREITA  = list(range(1, 7))
BOCAS_ESQUERDA = list(range(7, 13))


@router.get("/")
def status_tuneis():
    db = get_db()
    pallets = (
        db.table("pallets")
        .select("id,nro_pallet,tunel,boca,variedade,qtd_caixas")
        .eq("fase", "resfriamento")
        .execute()
        .data
    )

    tuneis: dict = {"01": {}, "02": {}}
    for p in pallets:
        tunel = p["tunel"]
        boca  = str(p["boca"])
        tuneis[tunel].setdefault(boca, []).append(p)

    return {
        "layout": {"direita": BOCAS_DIREITA, "esquerda": BOCAS_ESQUERDA},
        "tuneis": tuneis,
    }


@router.get("/{tunel_id}")
def status_tunel(tunel_id: str):
    db = get_db()
    pallets = (
        db.table("pallets")
        .select("*")
        .eq("fase", "resfriamento")
        .eq("tunel", tunel_id)
        .execute()
        .data
    )
    bocas: dict = {}
    for p in pallets:
        bocas.setdefault(str(p["boca"]), []).append(p)
    return {"tunel": tunel_id, "bocas": bocas}
