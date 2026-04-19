from fastapi import APIRouter, HTTPException
from api.models.schemas import RelatorioOut
from api.db.client import get_db

router = APIRouter()


@router.get("/", response_model=list[RelatorioOut])
def listar_relatorios(modulo: str | None = None):
    db = get_db()
    q = db.table("relatorios").select("*").order("created_at", desc=True)
    if modulo:
        q = q.eq("modulo", modulo)
    return q.execute().data


@router.get("/{relatorio_id}", response_model=RelatorioOut)
def detalhe_relatorio(relatorio_id: str):
    db = get_db()
    rows = db.table("relatorios").select("*").eq("id", relatorio_id).execute().data
    if not rows:
        raise HTTPException(404, "Relatório não encontrado")
    return rows[0]
