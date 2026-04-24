"""
Regras de negócio do Resfriamento.

Fluxo completo:
  1. Pallet entra em resfriamento automaticamente pela Recepção.
     Sessão do túnel é criada/vinculada automaticamente.
  2. Operador registra temp_polpa individualmente via salvar_temp_pallet().
  3. Operador encerra a sessão via finalizar_sessao() — apenas registra o
     encerramento do giro. NÃO move pallets.
  4. Operador cria OA selecionando pallets + definindo destino (câmara/rua/posição)
     para cada pallet. Posições ficam com status reservada_oa.
  5. Operador executa a OA — valida temperaturas + sessão encerrada →
     move pallets resfriamento → armazenamento e ocupa as posições.
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
    """Pallets em resfriamento ainda não vinculados a nenhuma OA."""
    db = get_db()

    oas = db.table("ordens_armazenamento").select("dados").execute().data
    ids_em_oa: set = set()
    for oa in oas:
        ids_em_oa.update((oa.get("dados") or {}).get("pallets", []))

    pallets = (
        db.table("pallets")
        .select("id,nro_pallet,variedade,qtd_caixas,classificacao,produtor,"
                "tunel,boca,temp_entrada,temp_saida,fase,updated_at")
        .eq("fase", "resfriamento")
        .order("tunel").order("boca")
        .execute()
        .data
    )
    return [p for p in pallets if p["id"] not in ids_em_oa]


def pallets_aguardando_oa() -> list:
    """
    Pallets em resfriamento cuja sessão foi finalizada
    e que ainda não estão vinculados a nenhuma OA.
    """
    db = get_db()

    oas = db.table("ordens_armazenamento").select("dados").execute().data
    ids_em_oa: set = set()
    for oa in oas:
        ids_em_oa.update((oa.get("dados") or {}).get("pallets", []))

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


# ─── posições disponíveis para alocação ───────────────────────

def posicoes_disponiveis() -> dict:
    """
    Retorna estrutura hierárquica de câmaras → ruas → posições,
    incluindo apenas posições com status 'livre'.
    Também retorna contadores de lotação por câmara e rua.
    """
    db = get_db()

    # Busca todas as posições não-gap
    todas = (
        db.table("posicoes_camara")
        .select("id,camara,tipo,rua,posicao,status,is_gap")
        .eq("is_gap", "false")
        .execute()
        .data
    )

    # Monta estrutura de lotação
    resultado = {}

    for pos in todas:
        camara = pos["camara"]
        rua = pos["rua"]
        status = pos["status"]

        if camara not in resultado:
            resultado[camara] = {
                "camara": camara,
                "total": 0,
                "livres": 0,
                "ruas": {}
            }

        resultado[camara]["total"] += 1
        if status == "livre":
            resultado[camara]["livres"] += 1

        rua_key = str(rua)
        if rua_key not in resultado[camara]["ruas"]:
            resultado[camara]["ruas"][rua_key] = {
                "rua": rua,
                "total": 0,
                "livres": 0,
                "posicoes": []
            }

        resultado[camara]["ruas"][rua_key]["total"] += 1
        if status == "livre":
            resultado[camara]["ruas"][rua_key]["livres"] += 1
            resultado[camara]["ruas"][rua_key]["posicoes"].append({
                "id": pos["id"],
                "posicao": pos["posicao"],
                "rua": rua,
                "camara": camara,
            })

    return resultado


# ─── temperatura ──────────────────────────────────────────────

def salvar_temp_pallet(pallet_id: str, temp_polpa: float, observacao: str | None, sessao_id: str | None, user_id: str | None = None) -> dict:
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
        "usuario": user_id,
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

def criar_oa(pallet_ids: list[str], sessao_id: str | None, destinos: list | None = None, user_id: str | None = None) -> dict:
    """
    Cria OA com pallets selecionados e destinos definidos.
    - Pallets devem estar em resfriamento.
    - Se destinos fornecidos: valida e reserva posições (status → reservada_oa).
    - OA fica com status 'programada'. Pallets ficam como 'reservados' (via posição reservada_oa).
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

    # Validar e reservar posições se destinos fornecidos
    destino_map = {}
    if destinos:
        for d in destinos:
            pos_id = f"C{d.camara}-R{str(d.rua).zfill(2)}-P{str(d.posicao).zfill(2)}"
            # Tenta também o formato corredor
            pos_rows = (
                db.table("posicoes_camara")
                .select("id,status,is_gap")
                .eq("camara", d.camara)
                .eq("rua", d.rua)
                .eq("posicao", d.posicao)
                .execute()
                .data
            )
            if not pos_rows:
                raise HTTPException(400, f"Posição não encontrada: Câmara {d.camara} Rua {d.rua} Posição {d.posicao}")
            pos = pos_rows[0]
            if pos["is_gap"]:
                raise HTTPException(400, f"Posição {pos['id']} é uma porta (gap) e não pode ser utilizada.")
            if pos["status"] != "livre":
                raise HTTPException(400, f"Posição {pos['id']} não está livre (status: {pos['status']}).")
            destino_map[d.pallet_id] = {"pos_id": pos["id"], "camara": d.camara, "rua": d.rua, "posicao": d.posicao}

    now = datetime.utcnow().isoformat()
    oa_id = _next_oa_id(db)
    tunel = pallets[0]["tunel"] if pallets else None

    # Reservar posições
    for pallet_id, dest in destino_map.items():
        db.table("posicoes_camara").update({
            "status": "reservada_oa",
            "reserva_id": oa_id,
            "pallet_id": pallet_id,
        }).eq("id", dest["pos_id"]).execute()

    # Serializar destinos para armazenar no JSONB
    destinos_serializados = [
        {"pallet_id": pid, **dest} for pid, dest in destino_map.items()
    ]

    db.table("ordens_armazenamento").insert({
        "id": oa_id,
        "sessao_id": sessao_id,
        "criada_em": now,
        "status": "programada",
        "dados": {
            "pallets": pallet_ids,
            "destinos": destinos_serializados,
        },
    }).execute()

    for pid in pallet_ids:
        db.table("historico").insert({
            "pallet_id": pid,
            "acao": "oa_criada",
            "fase_anterior": "resfriamento",
            "fase_nova": "resfriamento",
            "dados": {"oa_id": oa_id, "destino": destino_map.get(pid)},
            "usuario": user_id,
            "created_at": now,
        }).execute()

    return {"ok": True, "oa_id": oa_id, "pallets": pallet_ids, "destinos": destinos_serializados}


def iniciar_execucao_oa(oa_id: str) -> dict:
    """
    Inicia a execução da OA — muda status programada → em_execucao.
    Valida temperaturas e sessão encerrada antes de liberar a bipagem.
    NÃO move pallets ainda — isso só ocorre em concluir_oa().
    """
    db = get_db()
    rows = db.table("ordens_armazenamento").select("*").eq("id", oa_id).execute().data
    if not rows:
        raise HTTPException(404, "OA não encontrada.")
    oa = rows[0]
    if oa["status"] == "concluida":
        raise HTTPException(400, "OA já foi concluída.")
    if oa["status"] == "em_execucao":
        return oa  # idempotente — retorna estado atual para reabrir o modal

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
            f"Registre a temperatura dos pallets antes de executar: {', '.join(sem_temp)}"
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
                f"Encerre a sessão do Túnel {tunel} antes de executar."
            )

    now = datetime.utcnow().isoformat()
    db.table("ordens_armazenamento").update({
        "status": "em_execucao",
        "iniciada_em": now,
        "itens_bipados": [],
    }).eq("id", oa_id).execute()

    return db.table("ordens_armazenamento").select("*").eq("id", oa_id).execute().data[0]


def bipar_pallet(oa_id: str, pallet_id: str) -> dict:
    """
    Registra a bipagem de um pallet durante a execução da OA.
    Valida que o pallet pertence à OA. Retorna estado atualizado.
    """
    db = get_db()
    rows = db.table("ordens_armazenamento").select("*").eq("id", oa_id).execute().data
    if not rows:
        raise HTTPException(404, "OA não encontrada.")
    oa = rows[0]
    if oa["status"] != "em_execucao":
        raise HTTPException(400, "OA não está em execução.")

    pallet_ids = (oa.get("dados") or {}).get("pallets", [])
    if pallet_id not in pallet_ids:
        raise HTTPException(400, f"Pallet {pallet_id} não pertence a esta OA.")

    itens_bipados = oa.get("itens_bipados") or []
    if pallet_id in itens_bipados:
        raise HTTPException(400, f"Pallet {pallet_id} já foi bipado.")

    itens_bipados.append(pallet_id)
    db.table("ordens_armazenamento").update({
        "itens_bipados": itens_bipados,
    }).eq("id", oa_id).execute()

    return {
        "ok": True,
        "pallet_id": pallet_id,
        "bipados": len(itens_bipados),
        "total": len(pallet_ids),
        "completo": len(itens_bipados) == len(pallet_ids),
    }


def concluir_oa(oa_id: str, user_id: str | None = None) -> dict:
    """
    Conclui a OA após 100% dos pallets bipados.
    Move pallets resfriamento → armazenamento e ocupa as posições.
    """
    db = get_db()
    rows = db.table("ordens_armazenamento").select("*").eq("id", oa_id).execute().data
    if not rows:
        raise HTTPException(404, "OA não encontrada.")
    oa = rows[0]
    if oa["status"] != "em_execucao":
        raise HTTPException(400, "OA não está em execução.")

    pallet_ids = (oa.get("dados") or {}).get("pallets", [])
    destinos = (oa.get("dados") or {}).get("destinos", [])
    itens_bipados = oa.get("itens_bipados") or []

    nao_bipados = [p for p in pallet_ids if p not in itens_bipados]
    if nao_bipados:
        raise HTTPException(400,
            f"Bipe todos os pallets antes de concluir. Pendentes: {', '.join(nao_bipados)}"
        )

    now = datetime.utcnow().isoformat()
    destino_map = {d["pallet_id"]: d for d in destinos}

    pallets = (
        db.table("pallets")
        .select("id,fase,temp_saida,tunel")
        .in_("id", pallet_ids)
        .execute()
        .data
    )

    for p in pallets:
        dest = destino_map.get(p["id"])
        update_data = {"fase": "armazenamento", "updated_at": now}
        if dest:
            update_data["camara"] = dest.get("camara")
            update_data["rua"] = dest.get("rua")
            update_data["posicao"] = dest.get("posicao")

        db.table("pallets").update(update_data).eq("id", p["id"]).execute()

        if dest and dest.get("pos_id"):
            db.table("posicoes_camara").update({
                "status": "ocupada",
                "pallet_id": p["id"],
                "reserva_id": None,
            }).eq("id", dest["pos_id"]).execute()

        db.table("historico").insert({
            "pallet_id": p["id"],
            "acao": "resfriamento_fim",
            "fase_anterior": "resfriamento",
            "fase_nova": "armazenamento",
            "dados": {"oa_id": oa_id, "destino": dest},
            "usuario": user_id,
            "created_at": now,
        }).execute()

    db.table("ordens_armazenamento").update({
        "status": "concluida",
        "executada_em": now,
    }).eq("id", oa_id).execute()

    return {"ok": True, "oa_id": oa_id, "pallets_movidos": pallet_ids}


# ─── rollback ─────────────────────────────────────────────────

def rollback(pallet_id: str, user_id: str | None = None) -> dict:
    db = get_db()
    rows = db.table("pallets").select("*").eq("id", pallet_id).execute().data
    if not rows:
        raise HTTPException(404, "Pallet não encontrado")
    pallet = rows[0]
    if pallet["fase"] != "resfriamento":
        raise HTTPException(400, "Pallet não está em resfriamento")

    now = datetime.utcnow().isoformat()

    # Libera posição reservada para este pallet, se houver
    db.table("posicoes_camara").update({
        "status": "livre",
        "pallet_id": None,
        "reserva_id": None,
    }).eq("pallet_id", pallet_id).eq("status", "reservada_oa").execute()

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
        "usuario": user_id,
        "created_at": now,
    }).execute()
    return {"ok": True, "pallet_id": pallet_id}
