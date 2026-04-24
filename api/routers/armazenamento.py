from fastapi import APIRouter, Depends, HTTPException
from api.auth.deps import get_current_user, requer_role
from api.models.schemas import AlocarPalletIn, PosicaoOut
from api.services import armazenamento as svc

router = APIRouter()


@router.get("/pallets")
def listar_armazenados():
    return svc.listar_armazenados()


@router.get("/camaras")
def mapa_camaras():
    return svc.mapa_camaras()


@router.get("/posicoes-livres")
def posicoes_livres(camara: str | None = None):
    return svc.posicoes_livres(camara)


@router.get("/aguardando")
def aguardando_alocacao():
    return svc.aguardando_alocacao()


@router.post("/alocar")
def alocar_pallet(
    body: AlocarPalletIn,
    user: dict = Depends(requer_role("admin", "planejador")),
):
    return svc.alocar(body, user_id=user["id"])


@router.post("/{pallet_id}/rollback")
def rollback_armazenamento(
    pallet_id: str,
    user: dict = Depends(requer_role("admin")),
):
    return svc.rollback(pallet_id, user_id=user["id"])
