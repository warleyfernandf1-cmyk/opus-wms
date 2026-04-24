from fastapi import APIRouter, Depends
from api.auth.deps import requer_role
from api.models.schemas import OrdemExpedicaoCreate, OrdemExpedicaoOut
from api.services import expedicao as svc

router = APIRouter()

_OPERADOR_ACIMA   = requer_role("admin", "planejador", "operador")
_PLANEJADOR_ACIMA = requer_role("admin", "planejador")


@router.post("/ordem")
def criar_oe(
    body: OrdemExpedicaoCreate,
    user: dict = Depends(_PLANEJADOR_ACIMA),
):
    return svc.criar_ordem(body, user_id=user["id"])


@router.get("/ordens")
def listar_oes():
    return svc.listar_ordens()


@router.post("/ordens/{oe_id}/executar")
def executar_oe(
    oe_id: str,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.executar_ordem(oe_id, user_id=user["id"])
