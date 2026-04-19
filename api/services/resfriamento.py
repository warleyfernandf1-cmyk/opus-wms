"""
Regras de negócio do Resfriamento.

Fluxo:
  - Pallets entram em resfriamento automaticamente na Recepção (tunel+boca definidos).
  - iniciar_sessao(): move pallets recepcao→resfriamento (mantido para compatibilidade).
  - salvar_temp_pallet(): persiste temp_polpa individualmente e imediatamente no banco.
  - criar_oa(): cria OA com pallets selecionados manualmente — independente da sessão.
  - finalizar_sessao(): conclui a sessão do túnel — processo independente da OA.
  - rollback(): volta pallet resfriamento→recepcao.
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


# ─── consultas ────────────────────────────────────────────────

def status_tuneis() -> dict:
    db = get_db()
    pallets = (
        db.table("pallets")
        .select("id,nro_pallet,tunel,boca,variedade,qtd_caixas,classificacao,produtor,"
                "temp_entrada,temp_saida,data_embalamento,fase,created_at,updated_at")
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


def listar_sessoes(tunel: str | None = None, status: str | None = None) -> list:
    db = get_db()
    query = db.table("sessoes_resfriamento").select("*")
    if tunel:
        query = query.eq("tunel", tunel)
    if status:
        query = query.eq("status", status)
    return query.order("iniciado_em", desc=True).execute().data


def listar_oas(tunel: str | None = None) -> list:
    """Lista OAs com pallets detalhados."""
    db = get_db()
    query = db.table("ordens_armazenamento").select("*").order("criada_em", desc=True)
    if tunel:
        query = query.eq("tunel", tunel)
    oas = query.execute().data

    # Hidratar pallets de cada OA
    for oa in oas:
        pallet_ids = (oa.get("dados") or {}).get("pallets", [])
        if pallet_ids:
            pallets = (
                db.table("pallets")
                .select("id,variedade,qtd_caixas,classificacao,produtor,tunel,boca,"
                        "temp_entrada,temp_saida,fase,updated_at")
                .in_("id", pallet_ids)
                .execute()
                .data
            )
        else:
            pallets = []
        oa["pallets_detalhes"] = pallets
    return oas


def pallets_em_resfriamento() -> list:
    """Retorna todos os pallets atualmente em fase resfriamento para popular o modal de OA."""
    db = get_db()
    return (
        db.table("pallets")
        .select("id,nro_pallet,variedade,qtd_caixas,classificacao,produtor,"
                "tunel,boca,temp_entrada,temp_saida,fase,updated_at")
        .eq("fase", "resfriamento")
        .order("tunel")
        .order("boca")
        .execute()
        .data
    )


# ─── sessão ───────────────────────────────────────────────────

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


def salvar_temp_pallet(pallet_id: str, temp_polpa: float, observacao: str | None, sessao_id: str | None) -> dict:
    """Persiste temperatura de polpa imediatamente. Pallet continua em resfriamento."""
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado.")
    pallet = rows[0]
    if pallet["fase"] != "resfriamento":
        raise HTTPException(400, f"Pallet não está em resfriamento (fase: {pallet['fase']}).")

    now = datetime.utcnow().isoformat()
    db.table("pallets").update({"temp_saida": temp_polpa, "updated_at": now}).eq("id", pallet_id).execute()

    dados: dict = {"temp_polpa": temp_polpa, "tipo": "registro_individual"}
    if sessao_id:
        dados["sessao_id"] = sessao_id
    if observacao:
        dados["observacao"] = observacao

    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "temp_polpa_registrada",
        "fase_anterior": "resfriamento",
        "fase_nova": "resfriamento",
        "dados": dados,
        "created_at": now,
    }).execute()

    return {"ok": True, "pallet_id": pallet_id, "temp_polpa": temp_polpa}


def criar_oa(pallet_ids: list[str], sessao_id: str | None) -> dict:
    """
    Cria uma OA com os pallets selecionados manualmente.
    Independente de finalizar_sessao — pode ser criada a qualquer momento.
    Pallets devem estar em fase resfriamento.
    """
    db = get_db()
    if not pallet_ids:
        raise HTTPException(400, "Selecione ao menos um pallet.")

    # Valida que todos estão em resfriamento
    pallets = (
        db.table("pallets")
        .select("id,fase,tunel")
        .in_("id", pallet_ids)
        .execute()
        .data
    )
    invalidos = [p["id"] for p in pallets if p["fase"] != "resfriamento"]
    if invalidos:
        raise HTTPException(400, f"Pallets não estão em resfriamento: {', '.join(invalidos)}")

    now = datetime.utcnow().isoformat()
    oa_id = _next_oa_id(db)

    # Detecta túnel da OA (do primeiro pallet)
    tunel = pallets[0]["tunel"] if pallets else None

    db.table("ordens_armazenamento").insert({
        "id": oa_id,
        "sessao_id": sessao_id,
        "criada_em": now,
        "status": "pendente",
        "tunel": tunel,
        "dados": {"pallets": pallet_ids},
    }).execute()

    # Histórico
    for pid in pallet_ids:
        db.table("historico").insert({
            "pallet_id": pid,
            "acao": "oa_criada",
            "fase_anterior": "resfriamento",
            "fase_nova": "resfriamento",
            "dados": {"oa_id": oa_id},
            "created_at": now,
        }).execute()

    return {"ok": True, "oa_id": oa_id, "pallets": pallet_ids}


def finalizar_sessao(sessao_id: str, temp_saida: float) -> dict | None:
    db = get_db()
    rows = db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data
    if not rows:
        return None
    sessao = rows[0]
    if sessao["status"] == "finalizada":
        raise HTTPException(400, "Sessão já finalizada.")

    now = datetime.utcnow().isoformat()
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

    db.table("sessoes_resfriamento").update({
        "status": "finalizada",
        "finalizado_em": now,
        "temp_saida": temp_saida,
    }).eq("id", sessao_id).execute()

    return db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data[0]


def gerar_oa(sessao_id: str, *, _commit: bool = True, db=None, now: str = None, sessao: dict = None) -> str | None:
    """Mantido para compatibilidade com finalizar_sessao legado."""
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
        .select("id")
        .eq("fase", "armazenamento")
        .eq("tunel", sessao["tunel"])
        .is_("camara", "null")
        .execute()
        .data
    )

    oa_id = _next_oa_id(db)
    db.table("ordens_armazenamento").insert({
        "id": oa_id,
        "sessao_id": sessao_id,
        "criada_em": now,
        "status": "pendente",
        "tunel": sessao["tunel"],
        "dados": {"pallets": [p["id"] for p in pallets]},
    }).execute()

    if _commit:
        db.table("sessoes_resfriamento").update({"oa_id": oa_id}).eq("id", sessao_id).execute()

    return oa_id


# ─── rollback ─────────────────────────────────────────────────

def rollback(pallet_id: str) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado")
    pallet = rows[0]
    if pallet["fase"] != "resfriamento":
        raise HTTPException(400, "Pallet não está em resfriamento")

    now = datetime.utcnow().isoformat()
    db.table("pallets").update({
        "fase": "recepcao",
        "temp_saida": None,
        "updated_at": now,
    }).eq("id", pallet_id).execute()
    db.table("historico").insert({
        "pallet_id": pallet_id,
        "acao": "rollback_resfriamento",
        "fase_anterior": "resfriamento",
        "fase_nova": "recepcao",
        "created_at": now,
    }).execute()
    return {"ok": True, "pallet_id": pallet_id}
