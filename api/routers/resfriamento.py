from fastapi import APIRouter, HTTPException, Query
from typing import Optional
from api.models.schemas import SessaoOut, SalvarTempPalletIn, CriarOAIn
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


@router.get("/pallets-resfriamento")
def pallets_em_resfriamento():
    """Todos os pallets em resfriamento para o modal de criação de OA."""
    return svc.pallets_em_resfriamento()


@router.get("/pallets-aguardando-oa")
def pallets_aguardando_oa():
    """Pallets em resfriamento com sessão finalizada e sem vínculo a OA."""
    return svc.pallets_aguardando_oa()


@router.get("/oas")
def listar_oas():
    """Lista Ordens de Armazenamento com pallets detalhados."""
    return svc.listar_oas()


@router.post("/oa")
def criar_oa(body: CriarOAIn):
    """Cria OA com pallets selecionados. Independente de finalizar sessão."""
    return svc.criar_oa(pallet_ids=body.pallet_ids, sessao_id=body.sessao_id)


@router.post("/oa/{oa_id}/executar")
def executar_oa(oa_id: str):
    """
    Executa a OA — move pallets resfriamento→armazenamento.
    Valida temperaturas registradas e sessão do túnel encerrada.
    """
    return svc.executar_oa(oa_id)


@router.post("/sessao/{sessao_id}/finalizar", response_model=SessaoOut)
def finalizar_sessao(sessao_id: str):
    """Encerra o giro do túnel. Não move pallets — isso é responsabilidade da OA."""
    sessao = svc.finalizar_sessao(sessao_id)
    if not sessao:
        raise HTTPException(404, "Sessão não encontrada")
    return sessao


@router.post("/pallet/{pallet_id}/temp")
def salvar_temp_pallet(pallet_id: str, body: SalvarTempPalletIn):
    """Persiste temperatura de polpa imediatamente no banco."""
    return svc.salvar_temp_pallet(
        pallet_id=pallet_id,
        temp_polpa=body.temp_polpa,
        observacao=body.observacao,
        sessao_id=body.sessao_id,
    )


@router.post("/{pallet_id}/rollback")
def rollback_resfriamento(pallet_id: str):
    return svc.rollback(pallet_id)
