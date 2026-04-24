from fastapi import APIRouter, Depends, HTTPException
from api.auth.deps import requer_role
from api.models.schemas import OrdemPickingCreate, OrdemPickingOut
from api.services import picking as svc

router = APIRouter()

_OPERADOR_ACIMA   = requer_role("admin", "planejador", "operador")
_PLANEJADOR_ACIMA = requer_role("admin", "planejador")


@router.post("/ordem")
def criar_op(
    body: OrdemPickingCreate,
    user: dict = Depends(_PLANEJADOR_ACIMA),
):
    return svc.criar_ordem(body, user_id=user["id"])


@router.get("/ordens")
def listar_ops():
    return svc.listar_ordens()


@router.get("/ordens/{op_id}")
def detalhe_op(op_id: str):
    op = svc.buscar_ordem(op_id)
    if not op:
        raise HTTPException(404, "Ordem não encontrada")
    return op


@router.post("/ordens/{op_id}/executar")
def executar_op(
    op_id: str,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.executar_ordem(op_id, user_id=user["id"])


@router.post("/ordens/{op_id}/cancelar")
def cancelar_op(
    op_id: str,
    user: dict = Depends(requer_role("admin")),
):
    return svc.cancelar_ordem(op_id, user_id=user["id"])
