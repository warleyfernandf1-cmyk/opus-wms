from fastapi import APIRouter
from api.models.schemas import HistoricoOut
from api.db.client import get_db

router = APIRouter()


@router.get("/", response_model=list[HistoricoOut])
def audit_trail(pallet_id: str | None = None, acao: str | None = None, limit: int = 200):
    db = get_db()
    q = db.table("historico").select("*").order("created_at", desc=True).limit(limit)
    if pallet_id:
        q = q.eq("pallet_id", pallet_id)
    if acao:
        q = q.eq("acao", acao)
    return q.execute().data


@router.get("/pallet/{pallet_id}", response_model=list[HistoricoOut])
def historico_pallet(pallet_id: str):
    db = get_db()
    return (
        db.table("historico")
        .select("*")
        .eq("pallet_id", pallet_id)
        .order("created_at", desc=True)
        .execute()
        .data
    )
