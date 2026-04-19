from fastapi import APIRouter, HTTPException
from api.models.schemas import AlocarPalletIn, PosicaoOut
from api.services import armazenamento as svc

router = APIRouter()


@router.get("/camaras")
def mapa_camaras():
    return svc.mapa_camaras()


@router.get("/posicoes-livres")
def posicoes_livres(camara: str | None = None):
    return svc.posicoes_livres(camara)


@router.post("/alocar")
def alocar_pallet(body: AlocarPalletIn):
    return svc.alocar(body)


@router.post("/{pallet_id}/rollback")
def rollback_armazenamento(pallet_id: str):
    return svc.rollback(pallet_id)
