from fastapi import APIRouter, HTTPException
from api.models.schemas import OrdemExpedicaoCreate, OrdemExpedicaoOut
from api.services import expedicao as svc

router = APIRouter()


@router.post("/ordem", response_model=OrdemExpedicaoOut, status_code=201)
def criar_oe(body: OrdemExpedicaoCreate):
    return svc.criar_ordem(body)


@router.get("/ordens", response_model=list[OrdemExpedicaoOut])
def listar_oes():
    return svc.listar_ordens()


@router.post("/ordens/{oe_id}/executar")
def executar_oe(oe_id: str):
    return svc.executar_ordem(oe_id)
