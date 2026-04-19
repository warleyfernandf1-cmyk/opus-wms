from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from api.models.schemas import SessaoCreate, SessaoFinalizar, SessaoOut, SaidaPalletIn
from api.services import resfriamento as svc

router = APIRouter()


@router.get("/tuneis")
def status_tuneis():
    return svc.status_tuneis()


@router.get("/sessoes")
def listar_sessoes(
    tunel: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    """Lista sessões de resfriamento com filtros opcionais de túnel e status."""
    return svc.listar_sessoes(tunel=tunel, status=status)


@router.post("/sessao", response_model=SessaoOut, status_code=201)
def iniciar_sessao(body: SessaoCreate):
    return svc.iniciar_sessao(body.tunel)


@router.post("/sessao/{sessao_id}/finalizar", response_model=SessaoOut)
def finalizar_sessao(sessao_id: str, body: SessaoFinalizar):
    """Move todos os pallets do túnel para Armazenamento e gera OA."""
    sessao = svc.finalizar_sessao(sessao_id, body.temp_saida)
    if not sessao:
        raise HTTPException(404, "Sessão não encontrada")
    return sessao


@router.get("/sessao/{sessao_id}/oa")
def gerar_oa(sessao_id: str):
    oa = svc.gerar_oa(sessao_id)
    if not oa:
        raise HTTPException(404, "Sessão não encontrada ou OA já gerada")
    return oa


@router.post("/saida-pallet")
def saida_pallet(body: SaidaPalletIn):
    """
    Registra a saída individual de um pallet do túnel.
    Grava temp_polpa e observação; move pallet para fase armazenamento
    (aguardando alocação em câmara).
    """
    return svc.saida_pallet(
        pallet_id=body.pallet_id,
        sessao_id=body.sessao_id,
        temp_polpa=body.temp_polpa,
        observacao=body.observacao,
    )


@router.post("/{pallet_id}/rollback")
def rollback_resfriamento(pallet_id: str):
    return svc.rollback(pallet_id)
