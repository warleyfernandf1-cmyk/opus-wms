from fastapi import APIRouter
from api.models.schemas import RemontComplementacao, RemontJuncao, PalletOut
from api.services import remontes as svc

router = APIRouter()


@router.post("/complementacao", response_model=PalletOut)
def complementacao(body: RemontComplementacao):
    """Fundir pallet original com pallet de adição (sufixo A)."""
    return svc.complementacao(body.pallet_original_id, body.pallet_adicao_id)


@router.post("/juncao", response_model=PalletOut)
def juncao(body: RemontJuncao):
    """Fundir dois pallets distintos. Ex: 11 + 12 → '11 | 12'."""
    return svc.juncao(body.pallet_id_1, body.pallet_id_2)
