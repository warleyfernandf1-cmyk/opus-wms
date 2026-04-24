from fastapi import APIRouter, Depends, HTTPException
from api.auth.deps import requer_role
from api.models.schemas import InventarioItemRegistro, InventarioOut
from api.services import inventario as svc

router = APIRouter()

_OPERADOR_ACIMA   = requer_role("admin", "planejador", "operador")
_PLANEJADOR_ACIMA = requer_role("admin", "planejador")


@router.post("/iniciar", response_model=InventarioOut, status_code=201)
def iniciar_inventario(user: dict = Depends(_PLANEJADOR_ACIMA)):
    return svc.iniciar(user_id=user["id"])


@router.get("/", response_model=list[InventarioOut])
def listar_inventarios():
    return svc.listar()


@router.post("/{inventario_id}/registrar")
def registrar_item(
    inventario_id: str,
    body: InventarioItemRegistro,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.registrar_item(inventario_id, body, user_id=user["id"])


@router.post("/{inventario_id}/finalizar", response_model=InventarioOut)
def finalizar_inventario(
    inventario_id: str,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    inv = svc.finalizar(inventario_id, user_id=user["id"])
    if not inv:
        raise HTTPException(404, "Inventário não encontrado")
    return inv
