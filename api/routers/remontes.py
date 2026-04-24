from fastapi import APIRouter, Depends
from api.auth.deps import requer_role
from api.models.schemas import RemontComplementacao, RemontJuncao, PalletOut
from api.services import remontes as svc

router = APIRouter()

_PLANEJADOR_ACIMA = requer_role("admin", "planejador")


@router.post("/complementacao", response_model=PalletOut)
def complementacao(
    body: RemontComplementacao,
    user: dict = Depends(_PLANEJADOR_ACIMA),
):
    return svc.complementacao(body.pallet_original_id, body.pallet_adicao_id, user_id=user["id"])


@router.post("/juncao", response_model=PalletOut)
def juncao(
    body: RemontJuncao,
    user: dict = Depends(_PLANEJADOR_ACIMA),
):
    return svc.juncao(body.pallet_id_1, body.pallet_id_2, user_id=user["id"])
