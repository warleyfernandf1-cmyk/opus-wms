"""
Regras de negócio da Recepção.
- ID único: nunca repete numeração.
- Conflito → sufixo A-1, A-2, etc.
- Ao registrar, pallet já entra em fase 'resfriamento' automaticamente.
- Sessão do túnel é criada automaticamente se não houver uma ativa.
- Rollback é a única forma de excluir um pallet do sistema.
- areas_controles: lista de áreas/controles com distribuição proporcional de caixas.
  A soma de qtd_caixas deve ser igual ao total de caixas do pallet (validado no schema).
  Coluna legada `area` e `controle` são preenchidas com o primeiro item da lista.
"""
import json
from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db
from api.models.schemas import PalletCreate


def _gerar_id(nro_pallet: str, db) -> str:
    base = nro_pallet.strip()
    existing = db.table("pallets").select("id").like("id", f"{base}%").execute().data
    ids = {r["id"] for r in existing}
    if base not in ids:
        return base
    counter = 1
    while True:
        candidate = f"{base}-A-{counter}"
        if candidate not in ids:
            return candidate
        counter += 1


def _garantir_sessao_ativa(tunel: str, db, now: str) -> str:
    ativas = (
        db.table("sessoes_resfriamento")
        .select("id")
        .eq("tunel", tunel)
        .eq("status", "ativa")
        .execute()
        .data
    )
    if ativas:
        return ativas[0]["id"]

    row = {"tunel": tunel, "iniciado_em": now, "status": "ativa"}
    result = db.table("sessoes_resfriamento").insert(row).execute().data[0]
    return result["id"]


def registrar(body: PalletCreate, user_id: str | None = None) -> dict:
    db = get_db()
    pallet_id = _gerar_id(body.nro_pallet, db)
    is_adicao = "-A-" in pallet_id

    now = datetime.utcnow().isoformat()
    sessao_id = _garantir_sessao_ativa(body.tunel, db, now)

    areas_list = [item.model_dump() for item in body.areas_controles]
    first = body.areas_controles[0]
    body_dict = body.model_dump(exclude={"areas_controles"})

    row = {
        "id": pallet_id,
        **body_dict,
        "data_embalamento": body.data_embalamento.isoformat(),
        "area": first.area,
        "controle": first.controle,
        "areas_controles": json.dumps(areas_list),
        "fase": "resfriamento",
        "is_adicao": is_adicao,
        "created_at": now,
        "updated_at": now,
    }
    db.table("pallets").insert(row).execute()

    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "recepcao",
        "fase_nova": "resfriamento",
        "dados": {
            "is_adicao": is_adicao,
            "sessao_id": sessao_id,
            "areas_controles": areas_list,
        },
        "usuario": user_id,
        "created_at": now,
    }).execute()

    result = db.table("pallets").select("*").eq("id", pallet_id).execute().data[0]
    if result.get("areas_controles") and isinstance(result["areas_controles"], str):
        result["areas_controles"] = json.loads(result["areas_controles"])

    return result


def listar() -> list:
    db = get_db()
    rows = (
        db.table("pallets")
        .select("*")
        .in_("fase", ["recepcao", "resfriamento"])
        .order("created_at", desc=True)
        .execute()
        .data
    )
    for row in rows:
        if row.get("areas_controles") and isinstance(row["areas_controles"], str):
            row["areas_controles"] = json.loads(row["areas_controles"])
    return rows


def buscar(pallet_id: str) -> dict | None:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        return None
    row = rows[0]
    if row.get("areas_controles") and isinstance(row["areas_controles"], str):
        row["areas_controles"] = json.loads(row["areas_controles"])
    return row


def rollback(pallet_id: str, user_id: str | None = None) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado")
    pallet = rows[0]
    if pallet["fase"] not in ("recepcao", "resfriamento"):
        raise HTTPException(
            400,
            f"Rollback só é possível para pallets em recepção ou resfriamento. "
            f"Fase atual: {pallet['fase']}"
        )

    db.table("pallets").delete().eq("id", pallet_id).execute()
    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "rollback_recepcao",
        "fase_anterior": pallet["fase"],
        "dados": {"motivo": "exclusão via rollback"},
        "usuario": user_id,
        "created_at": datetime.utcnow().isoformat(),
    }).execute()

    return {"ok": True, "pallet_id": pallet_id, "mensagem": "Pallet excluído com sucesso."}
