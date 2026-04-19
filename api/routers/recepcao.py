from fastapi import APIRouter, HTTPException
from api.models.schemas import PalletCreate, PalletOut
from api.services import recepcao as svc

router = APIRouter()


@router.post("/", response_model=PalletOut, status_code=201)
def registrar_pallet(body: PalletCreate):
    return svc.registrar(body)


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
def rollback_recepcao(pallet_id: str):
    """Única forma de excluir um pallet do sistema."""
    return svc.rollback(pallet_id)
