from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from pydantic import BaseModel
from api.models.schemas import SessaoOut, SalvarTempPalletIn, CriarOAIn
from api.services import resfriamento as svc

router = APIRouter()


class BiparPalletIn(BaseModel):
    pallet_id: str


@router.get("/tuneis")
def status_tuneis():
    return svc.status_tuneis()


@router.get("/sessoes")
def listar_sessoes(
    tunel: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
):
    return svc.listar_sessoes(tunel=tunel, status=status)


@router.get("/pallets-resfriamento")
def pallets_em_resfriamento():
    return svc.pallets_em_resfriamento()


@router.get("/pallets-aguardando-oa")
def pallets_aguardando_oa():
    return svc.pallets_aguardando_oa()


@router.get("/oas")
def listar_oas():
    return svc.listar_oas()


@router.get("/posicoes-disponiveis")
def posicoes_disponiveis():
    return svc.posicoes_disponiveis()


@router.post("/oa")
def criar_oa(body: CriarOAIn):
    return svc.criar_oa(
        pallet_ids=body.pallet_ids,
        sessao_id=body.sessao_id,
        destinos=body.destinos,
    )


@router.post("/oa/{oa_id}/iniciar-execucao")
def iniciar_execucao_oa(oa_id: str):
    """
    Inicia execução da OA: programada → em_execucao.
    Valida temperaturas e sessão encerrada. Abre o modal de bipagem.
    """
    return svc.iniciar_execucao_oa(oa_id)


@router.post("/oa/{oa_id}/bipar")
def bipar_pallet(oa_id: str, body: BiparPalletIn):
    """
    Registra bipagem de um pallet durante execução.
    Retorna progresso (bipados/total).
    """
    return svc.bipar_pallet(oa_id=oa_id, pallet_id=body.pallet_id)


@router.post("/oa/{oa_id}/concluir")
def concluir_oa(oa_id: str):
    """
    Conclui a OA após 100% bipados: em_execucao → concluida.
    Move pallets para armazenamento e ocupa posições.
    """
    return svc.concluir_oa(oa_id)


@router.post("/sessao/{sessao_id}/finalizar", response_model=SessaoOut)
def finalizar_sessao(sessao_id: str):
    sessao = svc.finalizar_sessao(sessao_id)
    if not sessao:
        raise HTTPException(404, "Sessão não encontrada")
    return sessao


@router.post("/pallet/{pallet_id}/temp")
def salvar_temp_pallet(pallet_id: str, body: SalvarTempPalletIn):
    return svc.salvar_temp_pallet(
        pallet_id=pallet_id,
        temp_polpa=body.temp_polpa,
        observacao=body.observacao,
        sessao_id=body.sessao_id,
    )


@router.post("/{pallet_id}/rollback")
def rollback_resfriamento(pallet_id: str):
    return svc.rollback(pallet_id)
