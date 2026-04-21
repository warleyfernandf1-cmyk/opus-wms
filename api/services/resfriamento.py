"""
Regras de negócio do Resfriamento.

Fluxo completo:
  1. Pallet entra em resfriamento automaticamente pela Recepção.
  2. Operador registra temp_polpa individualmente via salvar_temp_pallet().
  3. Operador encerra a sessão via finalizar_sessao() — apenas registra o encerramento.
  4. Operador cria OA selecionando pallets + destinos (câmara/rua/posição).
     - Posições são validadas (livres) e reservadas (status reservada_oa).
     - OA criada com status "programada".
     - Relatório de apoio gerado automaticamente.
  5. Operador executa a OA — valida temperaturas + sessão encerrada →
     move pallets resfriamento → armazenamento, alocando nas posições reservadas.
"""
import uuid
from datetime import datetime
from fastapi import HTTPException
from api.db.client import get_db


def _next_oa_id(db) -> str:
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"OA-{today}-"
    rows = db.table("ordens_armazenamento").select("id").like("id", f"{prefix}%").execute().data
    nums = [int(r["id"].split("-")[-1]) for r in rows if r["id"].split("-")[-1].isdigit()]
    return f"{prefix}{max(nums, default=0) + 1:03d}"


# ─── consultas ────────────────────────────────────────────────

def status_tuneis() -> dict:
    db = get_db()
    pallets = (
        db.table("pallets")
        .select("id,nro_pallet,tunel,boca,variedade,qtd_caixas,classificacao,produtor,"
                "temp_entrada,temp_saida,data_embalamento,fase,created_at,updated_at")
        .eq("fase", "resfriamento")
        .not_.is_("tunel", "null")
        .execute().data
    )
    tuneis: dict = {"01": {}, "02": {}}
    for p in pallets:
        tuneis[p["tunel"]].setdefault(str(p["boca"]), []).append(p)
    return tuneis


def listar_sessoes(tunel: str | None = None, status: str | None = None) -> list:
    db = get_db()
    q = db.table("sessoes_resfriamento").select("*")
    if tunel: q = q.eq("tunel", tunel)
    if status: q = q.eq("status", status)
    return q.order("iniciado_em", desc=True).execute().data


def pallets_em_resfriamento() -> list:
    db = get_db()
    return (
        db.table("pallets")
        .select("id,nro_pallet,variedade,qtd_caixas,classificacao,produtor,"
                "tunel,boca,temp_entrada,temp_saida,fase,updated_at")
        .eq("fase", "resfriamento")
        .order("tunel").order("boca")
        .execute().data
    )


def pallets_aguardando_oa() -> list:
    db = get_db()
    oas = db.table("ordens_armazenamento").select("dados").execute().data
    ids_em_oa: set = set()
    for oa in oas:
        ids_em_oa.update((oa.get("dados") or {}).get("pallets", []))

    sessoes_finalizadas = (
        db.table("sessoes_resfriamento").select("tunel").eq("status", "finalizada").execute().data
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
        .execute().data
    )
    return [p for p in pallets if p["id"] not in ids_em_oa]


def listar_oas() -> list:
    db = get_db()
    oas = (
        db.table("ordens_armazenamento")
        .select("*")
        .order("criada_em", desc=True)
        .execute().data
    )
    for oa in oas:
        pallet_ids = (oa.get("dados") or {}).get("pallets", [])
        oa["pallets_detalhes"] = (
            db.table("pallets")
            .select("id,variedade,qtd_caixas,classificacao,produtor,tunel,boca,"
                    "temp_entrada,temp_saida,fase,updated_at")
            .in_("id", pallet_ids)
            .execute().data
        ) if pallet_ids else []
    return oas


# ─── temperatura ──────────────────────────────────────────────

def salvar_temp_pallet(pallet_id: str, temp_polpa: float, observacao: str | None, sessao_id: str | None) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado.")
    if rows[0]["fase"] != "resfriamento":
        raise HTTPException(400, f"Pallet não está em resfriamento (fase: {rows[0]['fase']}).")

    now = datetime.utcnow().isoformat()
    db.table("pallets").update({"temp_saida": temp_polpa, "updated_at": now}).eq("id", pallet_id).execute()

    dados: dict = {"temp_polpa": temp_polpa}
    if sessao_id: dados["sessao_id"] = sessao_id
    if observacao: dados["observacao"] = observacao

    db.table("historico").insert({
        "pallet_id": pallet_id, "acao": "temp_polpa_registrada",
        "fase_anterior": "resfriamento", "fase_nova": "resfriamento",
        "dados": dados, "created_at": now,
    }).execute()
    return {"ok": True, "pallet_id": pallet_id, "temp_polpa": temp_polpa}


# ─── sessão ───────────────────────────────────────────────────

def finalizar_sessao(sessao_id: str) -> dict | None:
    db = get_db()
    rows = db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data
    if not rows:
        return None
    if rows[0]["status"] == "finalizada":
        raise HTTPException(400, "Sessão já finalizada.")

    now = datetime.utcnow().isoformat()
    db.table("sessoes_resfriamento").update({
        "status": "finalizada", "finalizado_em": now,
    }).eq("id", sessao_id).execute()
    return db.table("sessoes_resfriamento").select("*").eq("id", sessao_id).execute().data[0]


# ─── OA ───────────────────────────────────────────────────────

def criar_oa(pallet_ids: list[str], sessao_id: str | None, destinos: list, operador: str = "Operador") -> dict:
    """
    Cria OA com destinos obrigatórios.
    - Valida que todos os pallets estão em resfriamento.
    - Valida que cada destino tem posição livre.
    - Reserva as posições (reservada_oa).
    - Status da OA: programada.
    - Gera relatório de apoio com origens e destinos.
    """
    db = get_db()
    if not pallet_ids:
        raise HTTPException(400, "Selecione ao menos um pallet.")

    # Valida destinos — todos os pallets devem ter destino
    destinos_map = {d.pallet_id: d for d in destinos}
    sem_destino = [pid for pid in pallet_ids if pid not in destinos_map]
    if sem_destino:
        raise HTTPException(400, f"Defina o destino para: {', '.join(sem_destino)}")

    # Valida fase dos pallets
    pallets = db.table("pallets").select("id,fase,tunel,boca,variedade,qtd_caixas,temp_saida").in_("id", pallet_ids).execute().data
    invalidos = [p["id"] for p in pallets if p["fase"] != "resfriamento"]
    if invalidos:
        raise HTTPException(400, f"Pallets não estão em resfriamento: {', '.join(invalidos)}")

    # Valida e reserva posições
    for pid in pallet_ids:
        d = destinos_map[pid]
        pos_id = f"C{d.camara}-R{d.rua:02d}-P{d.posicao:02d}"
        pos_rows = db.table("posicoes_camara").select("status").eq("id", pos_id).execute().data
        if not pos_rows:
            raise HTTPException(404, f"Posição {pos_id} não encontrada.")
        if pos_rows[0]["status"] != "livre":
            raise HTTPException(400, f"Posição {pos_id} não está livre (status: {pos_rows[0]['status']}).")

    now = datetime.utcnow().isoformat()
    oa_id = _next_oa_id(db)
    tunel = pallets[0]["tunel"] if pallets else None

    destinos_list = [{"pallet_id": d.pallet_id, "camara": d.camara, "rua": d.rua, "posicao": d.posicao} for d in destinos]

    db.table("ordens_armazenamento").insert({
        "id": oa_id, "sessao_id": sessao_id, "criada_em": now,
        "status": "programada", "tunel": tunel,
        "dados": {"pallets": pallet_ids, "destinos": destinos_list, "operador": operador},
    }).execute()

    # Reserva posições
    for d in destinos:
        pos_id = f"C{d.camara}-R{d.rua:02d}-P{d.posicao:02d}"
        db.table("posicoes_camara").update({"status": "reservada_oa", "reserva_id": oa_id}).eq("id", pos_id).execute()

    # Historico por pallet
    for pid in pallet_ids:
        db.table("historico").insert({
            "pallet_id": pid, "acao": "oa_criada",
            "fase_anterior": "resfriamento", "fase_nova": "resfriamento",
            "dados": {"oa_id": oa_id}, "created_at": now,
        }).execute()

    # Gera relatório de apoio
    pallets_map = {p["id"]: p for p in pallets}
    report_pallets = []
    for pid in pallet_ids:
        p = pallets_map.get(pid, {})
        d = destinos_map[pid]
        report_pallets.append({
            "pallet_id": pid,
            "variedade": p.get("variedade", "—"),
            "qtd_caixas": p.get("qtd_caixas", 0),
            "temp_polpa": p.get("temp_saida"),
            "origem": f"T{p.get('tunel','?')} Boca {p.get('boca','?')}",
            "destino": f"Câmara {d.camara} · R{d.rua:02d} · P{d.posicao:02d}",
        })

    db.table("relatorios").insert({
        "id": str(uuid.uuid4()),
        "modulo": "resfriamento",
        "titulo": f"{oa_id} — Programação de Armazenamento",
        "dados": {
            "oa_id": oa_id,
            "operador": operador,
            "criada_em": now,
            "total_pallets": len(pallet_ids),
            "total_caixas": sum(p.get("qtd_caixas") or 0 for p in pallets),
            "pallets": report_pallets,
        },
        "created_at": now,
    }).execute()

    return {"ok": True, "oa_id": oa_id, "pallets": pallet_ids}


def executar_oa(oa_id: str) -> dict:
    """
    Executa a OA — move pallets resfriamento → armazenamento,
    alocando cada pallet na posição reservada definida na criação da OA.
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

    destinos = {d["pallet_id"]: d for d in (oa.get("dados") or {}).get("destinos", [])}

    pallets = (
        db.table("pallets").select("id,fase,temp_saida,tunel").in_("id", pallet_ids).execute().data
    )

    sem_temp = [p["id"] for p in pallets if p.get("temp_saida") is None]
    if sem_temp:
        raise HTTPException(400,
            f"Pallets sem temperatura registrada: {', '.join(sem_temp)}")

    tuneis = {p["tunel"] for p in pallets if p.get("tunel")}
    for tunel in tuneis:
        if db.table("sessoes_resfriamento").select("id").eq("tunel", tunel).eq("status", "ativa").execute().data:
            raise HTTPException(400, f"Encerre a sessão do Túnel {tunel} antes de executar.")

    now = datetime.utcnow().isoformat()
    for p in pallets:
        dest = destinos.get(p["id"])
        updates = {"fase": "armazenamento", "updated_at": now}

        if dest:
            pos_id = f"C{dest['camara']}-R{dest['rua']:02d}-P{dest['posicao']:02d}"
            updates.update({"camara": dest["camara"], "rua": dest["rua"], "posicao": dest["posicao"]})
            db.table("posicoes_camara").update({
                "status": "ocupada", "pallet_id": p["id"], "reserva_id": None,
            }).eq("id", pos_id).execute()

        db.table("pallets").update(updates).eq("id", p["id"]).execute()
        db.table("historico").insert({
            "pallet_id": p["id"], "acao": "resfriamento_fim",
            "fase_anterior": "resfriamento", "fase_nova": "armazenamento",
            "dados": {"oa_id": oa_id, "destino": destinos.get(p["id"])},
            "created_at": now,
        }).execute()

    db.table("ordens_armazenamento").update({"status": "executada", "executada_em": now}).eq("id", oa_id).execute()
    return {"ok": True, "oa_id": oa_id, "pallets_movidos": pallet_ids}


# ─── rollback ─────────────────────────────────────────────────

def rollback(pallet_id: str) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado")
    if rows[0]["fase"] != "resfriamento":
        raise HTTPException(400, "Pallet não está em resfriamento")

    now = datetime.utcnow().isoformat()
    db.table("pallets").update({
        "fase": "recepcao", "temp_saida": None, "updated_at": now,
    }).eq("id", pallet_id).execute()
    db.table("historico").insert({
        "pallet_id": pallet_id, "acao": "rollback_resfriamento",
        "fase_anterior": "resfriamento", "fase_nova": "recepcao", "created_at": now,
    }).execute()
    return {"ok": True, "pallet_id": pallet_id}
