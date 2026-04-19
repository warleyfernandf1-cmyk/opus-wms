from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from api.models.schemas import SessaoCreate, SessaoFinalizar, SessaoOut, SalvarTempPalletIn
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
    return svc.listar_sessoes(tunel=tunel, status=status)


@router.get("/oas")
def listar_oas(tunel: Optional[str] = Query(None)):
    """Lista Ordens de Armazenamento geradas, opcionalmente filtradas por túnel."""
    return svc.listar_oas(tunel=tunel)


@router.get("/oa/{oa_id}")
def buscar_oa(oa_id: str):
    """Retorna uma OA com os pallets vinculados."""
    oa = svc.buscar_oa(oa_id)
    if not oa:
        raise HTTPException(404, "OA não encontrada")
    return oa


@router.post("/sessao", response_model=SessaoOut, status_code=201)
def iniciar_sessao(body: SessaoCreate):
    return svc.iniciar_sessao(body.tunel)


@router.post("/sessao/{sessao_id}/finalizar", response_model=SessaoOut)
def finalizar_sessao(sessao_id: str, body: SessaoFinalizar):
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


@router.post("/pallet/{pallet_id}/temp")
def salvar_temp_pallet(pallet_id: str, body: SalvarTempPalletIn):
    """
    Persiste a temperatura de polpa de um pallet individual.
    Chamado imediatamente ao salvar — antes de concluir a sessão.
    """
    return svc.salvar_temp_pallet(
        pallet_id=pallet_id,
        temp_polpa=body.temp_polpa,
        observacao=body.observacao,
        sessao_id=body.sessao_id,
    )


@router.post("/{pallet_id}/rollback")
def rollback_resfriamento(pallet_id: str):
    return svc.rollback(pallet_id)
