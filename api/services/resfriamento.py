"""
Regras de negócio do Resfriamento.

Fluxo completo:
  1. Pallet entra em resfriamento automaticamente pela Recepção.
     Sessão do túnel é criada/vinculada automaticamente.
  2. Operador registra temp_polpa individualmente via salvar_temp_pallet().
  3. Operador encerra a sessão via finalizar_sessao() — apenas registra o
     encerramento do giro. NÃO move pallets.
  4. Operador cria OA selecionando pallets da sessão.
  5. Operador executa a OA — valida temperaturas + sessão encerrada →
     move pallets resfriamento → armazenamento.
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
        .eq("fase", "resfriamento")
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


def pallets_em_resfriamento() -> list:
    """Todos os pallets em resfriamento para o modal de criação de OA."""
    db = get_db()
    return (
        db.table("pallets")
        .select("id,nro_pallet,variedade,qtd_caixas,classificacao,produtor,"
                "tunel,boca,temp_entrada,temp_saida,fase,updated_at")
        .eq("fase", "resfriamento")
        .order("tunel").order("boca")
        .execute()
        .data
    )


def pallets_aguardando_oa() -> list:
    """
    Pallets em resfriamento cuja sessão foi finalizada
    e que ainda não estão vinculados a nenhuma OA.
    """
    db = get_db()

    # IDs de pallets já vinculados a alguma OA
    oas = db.table("ordens_armazenamento").select("dados").execute().data
    ids_em_oa: set = set()
    for oa in oas:
        ids_em_oa.update((oa.get("dados") or {}).get("pallets", []))

    # Sessões finalizadas
    sessoes_finalizadas = (
        db.table("sessoes_resfriamento")
        .select("tunel")
        .eq("status", "finalizada")
        .execute()
        .data
    )
    tuneis_finalizados = {s["tunel"] for s in sessoes_finalizadas}

    if not tuneis_finalizados:
        return []

    pallets = (
        db.table("pallets")
        .select("id,nro_pallet,variedade,qtd_caixas,classificacao,produtor,"
                "tunel,boca,temp_entrada,temp_saida,fase,updated_at")
        .eq("fase", "resfriamento")
        .in_("tunel", list(tuneis_finalizados))
        .execute()
        .data
    )

    return [p for p in pallets if p["id"] not in ids_em_oa]


def listar_oas() -> list:
    """Lista OAs com pallets detalhados."""
    db = get_db()
    oas = (
        db.table("ordens_armazenamento")
        .select("*")
        .order("criada_em", desc=True)
        .execute()
        .data
    )
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


# ─── temperatura ──────────────────────────────────────────────

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

    dados: dict = {"temp_polpa": temp_polpa}
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


# ─── sessão ───────────────────────────────────────────────────

def finalizar_sessao(sessao_id: str) -> dict | None:
    """
    Encerra o giro do túnel. NÃO move pallets.
    A movimentação para armazenamento é responsabilidade da OA.
    """
    db = get_db()
    rows = db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data
    if not rows:
        return None
    sessao = rows[0]
    if sessao["status"] == "finalizada":
        raise HTTPException(400, "Sessão já finalizada.")

    now = datetime.utcnow().isoformat()
    db.table("sessoes_resfriamento").update({
        "status": "finalizada",
        "finalizado_em": now,
    }).eq("id", sessao_id).execute()

    return db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data[0]


# ─── OA ───────────────────────────────────────────────────────

def criar_oa(pallet_ids: list[str], sessao_id: str | None) -> dict:
    """
    Cria OA com pallets selecionados manualmente.
    Pallets devem estar em resfriamento.
    """
    db = get_db()
    if not pallet_ids:
        raise HTTPException(400, "Selecione ao menos um pallet.")

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
    tunel = pallets[0]["tunel"] if pallets else None

    db.table("ordens_armazenamento").insert({
        "id": oa_id,
        "sessao_id": sessao_id,
        "criada_em": now,
        "status": "pendente",
        "tunel": tunel,
        "dados": {"pallets": pallet_ids},
    }).execute()

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


def executar_oa(oa_id: str) -> dict:
    """
    Executa a OA — move pallets resfriamento → armazenamento.
    Valida:
      - Todos os pallets têm temp_saida registrada
      - A sessão do túnel foi finalizada
    """
    db = get_db()
    rows = db.table("ordens_armazenamento").select("*").eq("id", oa_id).execute().data
    if not rows:
        raise HTTPException(404, "OA não encontrada.")
    oa = rows[0]
    if oa["status"] == "executada":
        raise HTTPException(400, "OA já foi executada.")

    pallet_ids = (oa.get("dados") or {}).get("pallets", [])
    if not pallet_ids:
        raise HTTPException(400, "OA sem pallets vinculados.")

    pallets = (
        db.table("pallets")
        .select("id,fase,temp_saida,tunel")
        .in_("id", pallet_ids)
        .execute()
        .data
    )

    # Valida temperaturas
    sem_temp = [p["id"] for p in pallets if p.get("temp_saida") is None]
    if sem_temp:
        raise HTTPException(400,
            f"A execução desta OA aguarda o registro de saída dos pallets no módulo Resfriamento. "
            f"Pallets sem temperatura: {', '.join(sem_temp)}"
        )

    # Valida sessão finalizada
    tuneis = {p["tunel"] for p in pallets if p.get("tunel")}
    for tunel in tuneis:
        sessao_ativa = (
            db.table("sessoes_resfriamento")
            .select("id")
            .eq("tunel", tunel)
            .eq("status", "ativa")
            .execute()
            .data
        )
        if sessao_ativa:
            raise HTTPException(400,
                f"A execução desta OA aguarda o encerramento da sessão do Túnel {tunel} "
                f"no módulo Resfriamento."
            )

    now = datetime.utcnow().isoformat()
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
            "dados": {"oa_id": oa_id},
            "created_at": now,
        }).execute()

    db.table("ordens_armazenamento").update({
        "status": "executada",
        "executada_em": now,
    }).eq("id", oa_id).execute()

    return {"ok": True, "oa_id": oa_id, "pallets_movidos": pallet_ids}


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
