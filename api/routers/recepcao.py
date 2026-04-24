from fastapi import APIRouter, Depends, HTTPException
from api.auth.deps import get_current_user, requer_role
from api.models.schemas import PalletCreate, PalletOut
from api.services import recepcao as svc

router = APIRouter()


@router.post("/", response_model=PalletOut, status_code=201)
def registrar_pallet(
    body: PalletCreate,
    user: dict = Depends(requer_role("admin", "planejador")),
):
    return svc.registrar(body, user_id=user["id"])


@router.get("/", response_model=list[PalletOut])
def listar_recepcao():
    return svc.listar()


@router.get("/{pallet_id}", response_model=PalletOut)
def detalhe_pallet(pallet_id: str):
    pallet = svc.buscar(pallet_id)
    if not pallet:
        raise HTTPException(404, "Pallet não encontrado")
    return pallet


@router.delete("/{pallet_id}/rollback", status_code=200)
def rollback_recepcao(
    pallet_id: str,
    user: dict = Depends(requer_role("admin")),
):
    return svc.rollback(pallet_id, user_id=user["id"])
