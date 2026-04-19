"""
Regras de negócio do Resfriamento.
- Saída por sessão: para mover um pallet, todos do túnel devem ser movidos.
- Temperatura de saída é obrigatória ao finalizar.
- Gera Ordem de Armazenamento (OA) ao finalizar sessão.
"""
from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db


def _next_oa_id(db) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"OA-{today}-"
    rows = db.table("ordens_armazenamento").select("id").like("id", f"{prefix}%").execute().data
    nums = [int(r["id"].split("-")[-1]) for r in rows if r["id"].split("-")[-1].isdigit()]
    seq = max(nums, default=0) + 1
    return f"{prefix}{seq:03d}"


def status_tuneis() -> dict:
    db = get_db()
    pallets = (
        db.table("pallets")
        .select("id,nro_pallet,tunel,boca,variedade,qtd_caixas,fase")
        .in_("fase", ["recepcao", "resfriamento"])
        .not_.is_("tunel", "null")
        .execute()
        .data
    )
    tuneis: dict = {"01": {}, "02": {}}
    for p in pallets:
        boca = str(p["boca"])
        tuneis[p["tunel"]].setdefault(boca, []).append(p)
    return tuneis


def iniciar_sessao(tunel: str) -> dict:
    db = get_db()
    ativa = (
        db.table("sessoes_resfriamento")
        .select("id")
        .eq("tunel", tunel)
        .eq("status", "ativa")
        .execute()
        .data
    )
    if ativa:
        raise HTTPException(400, f"Túnel {tunel} já possui sessão ativa.")

    now = datetime.utcnow().isoformat()
    row = {"tunel": tunel, "iniciado_em": now, "status": "ativa"}
    result = db.table("sessoes_resfriamento").insert(row).execute().data[0]

    # Mover todos os pallets deste túnel de recepcao → resfriamento
    pallets_recepcao = (
        db.table("pallets")
        .select("id")
        .eq("fase", "recepcao")
        .eq("tunel", tunel)
        .execute()
        .data
    )
    for p in pallets_recepcao:
        db.table("pallets").update({"fase": "resfriamento", "updated_at": now}).eq("id", p["id"]).execute()
        db.table("historico").insert({
            "pallet_id": p["id"],
            "acao": "resfriamento_inicio",
            "fase_anterior": "recepcao",
            "fase_nova": "resfriamento",
            "dados": {"sessao_id": result["id"]},
            "created_at": now,
        }).execute()

    return result


def finalizar_sessao(sessao_id: str, temp_saida: float) -> dict | None:
    db = get_db()
    rows = db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data
    if not rows:
        return None
    sessao = rows[0]
    if sessao["status"] == "finalizada":
        raise HTTPException(400, "Sessão já finalizada.")

    now = datetime.utcnow().isoformat()

    # Mover todos os pallets do túnel para fase armazenamento
    pallets = (
        db.table("pallets")
        .select("id")
        .eq("fase", "resfriamento")
        .eq("tunel", sessao["tunel"])
        .execute()
        .data
    )
    for p in pallets:
        db.table("pallets").update({
            "fase": "armazenamento",
            "temp_saida": temp_saida,
            "updated_at": now,
        }).eq("id", p["id"]).execute()
        db.table("historico").insert({
            "pallet_id": p["id"],
            "acao": "resfriamento_fim",
            "fase_anterior": "resfriamento",
            "fase_nova": "armazenamento",
            "dados": {"temp_saida": temp_saida, "sessao_id": sessao_id},
            "created_at": now,
        }).execute()

    oa_id = gerar_oa(sessao_id, _commit=False, db=db, now=now, sessao=sessao)

    db.table("sessoes_resfriamento").update({
        "status": "finalizada",
        "finalizado_em": now,
        "temp_saida": temp_saida,
        "oa_id": oa_id,
    }).eq("id", sessao_id).execute()

    return db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data[0]


def gerar_oa(sessao_id: str, *, _commit: bool = True, db=None, now: str = None, sessao: dict = None) -> str | None:
    if db is None:
        db = get_db()
    if now is None:
        now = datetime.utcnow().isoformat()

    if sessao is None:
        rows = db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data
        if not rows:
            return None
        sessao = rows[0]

    pallets = (
        db.table("pallets")
        .select("id,variedade,qtd_caixas,camara,rua,posicao")
        .eq("fase", "armazenamento")
        .execute()
        .data
    )

    oa_id = _next_oa_id(db)
    db.table("ordens_armazenamento").insert({
        "id": oa_id,
        "sessao_id": sessao_id,
        "criada_em": now,
        "status": "pendente",
        "dados": {"pallets": [p["id"] for p in pallets]},
    }).execute()

    if _commit:
        db.table("sessoes_resfriamento").update({"oa_id": oa_id}).eq("id", sessao_id).execute()

    return oa_id


def rollback(pallet_id: str) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado")
    pallet = rows[0]
    if pallet["fase"] != "resfriamento":
        raise HTTPException(400, "Pallet não está em resfriamento")

    now = datetime.utcnow().isoformat()
    db.table("pallets").update({"fase": "recepcao", "updated_at": now}).eq("id", pallet_id).execute()
    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "rollback_resfriamento",
        "fase_anterior": "resfriamento",
        "fase_nova": "recepcao",
        "created_at": now,
    }).execute()
    return {"ok": True, "pallet_id": pallet_id}
