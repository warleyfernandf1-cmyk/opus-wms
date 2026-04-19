from fastapi import APIRouter, HTTPException
from api.models.schemas import InventarioItemRegistro, InventarioOut
from api.services import inventario as svc

router = APIRouter()


@router.post("/iniciar", response_model=InventarioOut, status_code=201)
def iniciar_inventario():
    return svc.iniciar()


@router.get("/", response_model=list[InventarioOut])
def listar_inventarios():
    return svc.listar()


@router.post("/{inventario_id}/registrar")
def registrar_item(inventario_id: str, body: InventarioItemRegistro):
    return svc.registrar_item(inventario_id, body)


@router.post("/{inventario_id}/finalizar", response_model=InventarioOut)
def finalizar_inventario(inventario_id: str):
    inv = svc.finalizar(inventario_id)
    if not inv:
        raise HTTPException(404, "Inventário não encontrado")
    return inv
