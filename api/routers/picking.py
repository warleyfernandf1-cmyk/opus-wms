from fastapi import APIRouter, HTTPException
from api.models.schemas import OrdemPickingCreate, OrdemPickingOut
from api.services import picking as svc

router = APIRouter()


@router.post("/ordem", response_model=OrdemPickingOut, status_code=201)
def criar_op(body: OrdemPickingCreate):
    """Cria OP e bloqueia/reserva posições dos pallets."""
    return svc.criar_ordem(body)


@router.get("/ordens", response_model=list[OrdemPickingOut])
def listar_ops():
    return svc.listar_ordens()


@router.get("/ordens/{op_id}", response_model=OrdemPickingOut)
def detalhe_op(op_id: str):
    op = svc.buscar_ordem(op_id)
    if not op:
        raise HTTPException(404, "Ordem não encontrada")
    return op


@router.post("/ordens/{op_id}/executar")
def executar_op(op_id: str):
    return svc.executar_ordem(op_id)


@router.post("/ordens/{op_id}/cancelar")
def cancelar_op(op_id: str):
    """Cancela OP e libera todas as posições reservadas."""
    return svc.cancelar_ordem(op_id)
