from fastapi import APIRouter, HTTPException, Query, Depends
from typing import Optional
from pydantic import BaseModel
from api.auth.deps import get_current_user, requer_role
from api.models.schemas import SessaoOut, SalvarTempPalletIn, CriarOAIn
from api.services import resfriamento as svc

router = APIRouter()

_OPERADOR_ACIMA = requer_role("admin", "planejador", "operador")
_PLANEJADOR_ACIMA = requer_role("admin", "planejador")


class BiparPalletIn(BaseModel):
    pallet_id: str


# ── Consultas ─────────────────────────────────────────────────

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


# ── Operador + acima ──────────────────────────────────────────

@router.post("/pallet/{pallet_id}/temp")
def salvar_temp_pallet(
    pallet_id: str,
    body: SalvarTempPalletIn,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.salvar_temp_pallet(
        pallet_id=pallet_id,
        temp_polpa=body.temp_polpa,
        observacao=body.observacao,
        sessao_id=body.sessao_id,
        foto_temp_saida=body.foto_temp_saida,
        user_id=user["id"],
    )


@router.post("/oa/{oa_id}/iniciar-execucao")
def iniciar_execucao_oa(
    oa_id: str,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.iniciar_execucao_oa(oa_id)


@router.post("/oa/{oa_id}/bipar")
def bipar_pallet(
    oa_id: str,
    body: BiparPalletIn,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.bipar_pallet(oa_id=oa_id, pallet_id=body.pallet_id)


@router.post("/oa/{oa_id}/concluir")
def concluir_oa(
    oa_id: str,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.concluir_oa(oa_id, user_id=user["id"])


# ── Planejador + acima ────────────────────────────────────────

@router.post("/oa")
def criar_oa(
    body: CriarOAIn,
    user: dict = Depends(_PLANEJADOR_ACIMA),
):
    return svc.criar_oa(
        pallet_ids=body.pallet_ids,
        sessao_id=body.sessao_id,
        destinos=body.destinos,
        user_id=user["id"],
    )


@router.post("/sessao/{sessao_id}/finalizar", response_model=SessaoOut)
def finalizar_sessao(
    sessao_id: str,
    user: dict = Depends(_PLANEJADOR_ACIMA),
):
    sessao = svc.finalizar_sessao(sessao_id)
    if not sessao:
        raise HTTPException(404, "Sessão não encontrada")
    return sessao


@router.get("/sessao/{sessao_id}/relatorio")
def relatorio_sessao(
    sessao_id: str,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.relatorio_sessao(sessao_id)


@router.post("/sessao/{sessao_id}/limpar-fotos")
def limpar_fotos_sessao(
    sessao_id: str,
    user: dict = Depends(_OPERADOR_ACIMA),
):
    return svc.limpar_fotos_sessao(sessao_id)


# ── Admin ─────────────────────────────────────────────────────

@router.post("/{pallet_id}/rollback")
def rollback_resfriamento(
    pallet_id: str,
    user: dict = Depends(requer_role("admin")),
):
    return svc.rollback(pallet_id, user_id=user["id"])
