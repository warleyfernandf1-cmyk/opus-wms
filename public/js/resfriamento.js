/**
 * resfriamento.js
 *
 * Fluxo:
 * 1. Pallets entram em resfriamento automaticamente pela Recepção.
 *    Sessão do túnel criada automaticamente ao registrar primeiro pallet.
 * 2. Operador registra temperatura de polpa por pallet (persiste imediatamente).
 * 3. Operador encerra sessão — apenas registra o fim do giro, NÃO move pallets.
 * 4. Pallets sem OA ficam em "Aguardando vínculo a OA".
 * 5. Operador cria OA selecionando pallets + definindo destino (Câmara → Rua → Posição)
 *    para cada pallet. Posições ficam com status reservada_oa.
 * 6. Operador executa OA — backend valida temps + sessão encerrada → move para armazenamento.
 */

/* ─── estado ────────────────────────────────────────────────── */
let tunelAtivo = '01';
let palletSelecionadoId = null;
let dadosTuneis = {};
let sessaoAtiva = null;
let modalPallets = [];
let modalSelecionados = new Set();
let posicoesDisponiveis = {};       // câmara → rua → posições
let destinosPorPallet = {};         // pallet_id → { camara, rua, posicao }

/* ─── helpers ───────────────────────────────────────────────── */

function semanaISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - inicio) / 86400000) + 1) / 7);
}

function labelSessao(tunel, remessa) {
  return `T${tunel} - ${remessa}ª Remessa - S${semanaISO()}`;
}

function palletsDoTunel() {
  const bocas = dadosTuneis[tunelAtivo] || {};
  return Object.values(bocas).flat();
}

/* ─── bocas ─────────────────────────────────────────────────── */

function renderBocas() {
  const grid = document.getElementById('bocas-grid');
  const bocas = dadosTuneis[tunelAtivo] || {};
  const cards = [];

  for (let b = 1; b <= 12; b++) {
    const pallets = bocas[String(b)] || [];
    if (!pallets.length) {
      cards.push(`<div class="boca-card">
        <span class="boca-num">Boca ${b}</span>
        <span class="boca-vazia">Vazia</span>
      </div>`);
    } else {
      pallets.forEach(p => {
        const sel = palletSelecionadoId === p.id;
        const temTemp = p.temp_saida != null;
        const cls = ['boca-card','ocupada', sel?'selecionada':'', temTemp?'com-temp':''].filter(Boolean).join(' ');
        cards.push(`<div class="${cls}" onclick="abrirDetalhe('${p.id}',${b})">
          <span class="boca-num">Boca ${b}</span>
          <span class="boca-pallet">${p.id}</span>
          <span class="boca-var">${p.variedade||'—'}</span>
          <span class="boca-temp">${p.temp_entrada!=null?p.temp_entrada+'°C':'—'}</span>
          ${temTemp?`<span class="boca-temp-saida">Polpa: ${p.temp_saida}°C ✓</span>`:''}
        </div>`);
      });
    }
  }
  grid.innerHTML = cards.join('');
  atualizarEncerrarBar();
}

/* ─── barra encerrar sessão ─────────────────────────────────── */

function atualizarEncerrarBar() {
  const bar = document.getElementById('encerrar-bar');
  const btn = document.getElementById('btn-encerrar-sessao');
  const info = document.getElementById('encerrar-info');
  const todos = palletsDoTunel();

  if (!sessaoAtiva || todos.length === 0) { bar.style.display='none'; return; }

  bar.style.display = 'flex';
  const comTemp = todos.filter(p => p.temp_saida != null).length;
  const total = todos.length;
  const ok = comTemp === total;

  info.innerHTML = ok
    ? `<span>${total}/${total}</span> pallets com temperatura — pronto para encerrar sessão`
    : `<span>${comTemp}/${total}</span> pallets com temperatura registrada`;
  btn.disabled = !ok;
}

/* ─── barra de sessão ───────────────────────────────────────── */

async function renderSessaoBar() {
  const bar = document.getElementById('sessao-bar');
  if (!sessaoAtiva) { bar.style.display='none'; return; }

  let remessa = 1;
  try {
    const todas = await api.get(`/resfriamento/sessoes?tunel=${tunelAtivo}`);
    const hoje = new Date().toISOString().slice(0,10);
    remessa = todas.filter(s => s.iniciado_em?.startsWith(hoje)).length;
  } catch(_) {}

  const criada = sessaoAtiva.iniciado_em
    ? new Date(sessaoAtiva.iniciado_em).toLocaleString('pt-BR') : '—';
  document.getElementById('sessao-label').textContent = labelSessao(tunelAtivo, remessa);
  document.getElementById('sessao-info').textContent =
    `Criada em ${criada} · Pallets: ${palletsDoTunel().length}`;
  bar.style.display = 'flex';
}

/* ─── aguardando OA ─────────────────────────────────────────── */

async function renderAguardandoOA() {
  const container = document.getElementById('aguardando-oa-container');
  try {
    const pallets = await api.get('/resfriamento/pallets-aguardando-oa');
    if (!pallets || !pallets.length) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhum pallet aguardando vínculo a OA.</span>';
      return;
    }
    container.innerHTML = `
      <table class="aw-table">
        <thead><tr>
          <th>N° Pallet</th><th>Variedade</th><th>Classif.</th>
          <th>Túnel / Boca</th><th>Temp. entrada</th><th>Temp. polpa</th><th>Atualizado em</th>
        </tr></thead>
        <tbody>
          ${pallets.map(p => `<tr>
            <td style="font-weight:600">${p.id}</td>
            <td>${p.variedade||'—'}</td>
            <td><span class="badge-${(p.classificacao||'').toLowerCase()==='good'?'good':'frutibras'}">${p.classificacao||'—'}</span></td>
            <td>T${p.tunel||'?'} · Boca ${p.boca||'?'}</td>
            <td>${p.temp_entrada!=null?p.temp_entrada+'°C':'—'}</td>
            <td>${p.temp_saida!=null?p.temp_saida+'°C':'<span style="color:#f59e0b">Pendente</span>'}</td>
            <td>${p.updated_at?new Date(p.updated_at).toLocaleString('pt-BR'):'—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch(e) {
    container.innerHTML = `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

/* ─── OAs ───────────────────────────────────────────────────── */

async function renderOAs() {
  const container = document.getElementById('oas-container');
  try {
    const oas = await api.get('/resfriamento/oas');
    if (!oas || !oas.length) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhuma OA criada ainda.</span>';
      return;
    }
    container.innerHTML = oas.map(oa => {
      const pallets = oa.pallets_detalhes || [];
      const criada = oa.criada_em ? new Date(oa.criada_em).toLocaleString('pt-BR') : '—';
      const status = oa.status || 'pendente';
      const executada = status === 'executada';
      const programada = status === 'programada';
      const badgeCls = executada ? 'oa-badge-executada' : programada ? 'oa-badge-programada' : 'oa-badge-pendente';
      const tags = pallets.map(p =>
        `<span class="oa-pallet-tag">${p.id} · T${p.tunel||'?'} B${p.boca||'?'}${p.temp_saida!=null?' ✓':' ⚠'}</span>`
      ).join('');
      return `<div class="oa-card">
        <div class="oa-card-header">
          <span class="oa-id">${oa.id}</span>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="oa-badge ${badgeCls}">${status}</span>
            ${!executada ? `<button class="btn btn-primary btn-sm" onclick="executarOA('${oa.id}')">▶ Executar</button>` : ''}
          </div>
        </div>
        <div class="oa-meta">Criada em ${criada} · ${pallets.length} pallet(s)</div>
        <div class="oa-pallets">${tags||'<span style="opacity:.5">—</span>'}</div>
      </div>`;
    }).join('');
  } catch(e) {
    container.innerHTML = `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

async function executarOA(oaId) {
  try {
    await api.post(`/resfriamento/oa/${oaId}/executar`, {});
    showToast(`OA ${oaId} executada! Pallets movidos para armazenamento.`, 'success');
    await init();
  } catch(e) {
    showToast(e.message, 'error');
  }
}

/* ═══════════════════════════════════════════════════════════════
   MODAL DE CRIAÇÃO DE OA — Selects cascata com validação de destino
   ═══════════════════════════════════════════════════════════════ */

async function abrirModalOA() {
  modalSelecionados = new Set();
  destinosPorPallet = {};
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-pallets-lista').innerHTML =
    '<span style="color:var(--text-muted);font-size:.82rem">Carregando pallets...</span>';
  document.getElementById('chk-todos').checked = false;
  atualizarContadorModal();

  try {
    // Carrega pallets e posições disponíveis em paralelo
    [modalPallets, posicoesDisponiveis] = await Promise.all([
      api.get('/resfriamento/pallets-resfriamento'),
      api.get('/resfriamento/posicoes-disponiveis'),
    ]);
    renderModalPallets();
  } catch(e) {
    document.getElementById('modal-pallets-lista').innerHTML =
      `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

/* ─── render lista de pallets no modal ──────────────────────── */

function renderModalPallets() {
  const lista = document.getElementById('modal-pallets-lista');
  if (!modalPallets.length) {
    lista.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhum pallet em resfriamento no momento.</span>';
    return;
  }

  lista.innerHTML = modalPallets.map(p => {
    const sel = modalSelecionados.has(p.id);
    const temTemp = p.temp_saida != null;
    const destino = destinosPorPallet[p.id];
    const destinoValido = !!destino;

    // Monta os selects cascata para este pallet
    const selectsHtml = sel ? renderDestinoPallet(p.id, destino) : '';

    return `<div class="pallet-row ${sel ? 'selecionado' : ''}" id="prow-${p.id}">
      <div class="pallet-row-top" onclick="togglePallet('${p.id}')">
        <input type="checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation();togglePallet('${p.id}')">
        <div class="pallet-row-info">
          <div class="pallet-row-id">Pallet ${p.id}</div>
          <div class="pallet-row-meta">${p.variedade||'—'} · ${p.qtd_caixas||'?'} cx · ${p.produtor||'—'} · T${p.tunel||'?'} Boca ${p.boca||'?'}</div>
        </div>
        <span class="pallet-row-temp ${temTemp?'ok':'sem'}">
          ${temTemp ? 'Polpa: '+p.temp_saida+'°C ✓' : 'Sem temp.'}
        </span>
        ${sel ? `<span class="destino-badge ${destinoValido ? 'destino-ok' : 'destino-pendente'}">
          ${destinoValido
            ? `📍 C${destino.camara} · R${destino.rua} · P${destino.posicao}`
            : '⚠ Destino obrigatório'}
        </span>` : ''}
      </div>
      ${selectsHtml}
    </div>`;
  }).join('');
}

/* ─── render selects cascata de destino ─────────────────────── */

function renderDestinoPallet(palletId, destinoAtual) {
  const camaras = Object.keys(posicoesDisponiveis).sort();

  if (!camaras.length) {
    return `<div class="destino-selects">
      <span style="color:var(--danger);font-size:.78rem">⚠ Nenhuma posição livre disponível nas câmaras.</span>
    </div>`;
  }

  // ── Select Câmara ──
  const camaraOptions = camaras.map(c => {
    const cam = posicoesDisponiveis[c];
    const lotacao = `${cam.total - cam.livres}/${cam.total}`;
    const disabled = cam.livres === 0 ? 'disabled' : '';
    const selected = destinoAtual?.camara === c ? 'selected' : '';
    return `<option value="${c}" ${disabled} ${selected}>
      Câmara ${c} (Livres: ${cam.livres}/${cam.total})
    </option>`;
  }).join('');

  const camaraVal = destinoAtual?.camara || '';

  // ── Select Rua (dependente da câmara selecionada) ──
  let ruaOptions = '<option value="">— Selecione a câmara —</option>';
  if (camaraVal && posicoesDisponiveis[camaraVal]) {
    const ruas = Object.values(posicoesDisponiveis[camaraVal].ruas)
      .filter(r => r.livres > 0)
      .sort((a, b) => a.rua - b.rua);
    ruaOptions = '<option value="">— Selecione a rua —</option>' +
      ruas.map(r => {
        const selected = destinoAtual?.rua === r.rua ? 'selected' : '';
        return `<option value="${r.rua}" ${selected}>
          Rua ${r.rua} (Livres: ${r.livres}/${r.total})
        </option>`;
      }).join('');
  }

  const ruaVal = destinoAtual?.rua || '';

  // ── Select Posição (dependente da câmara + rua selecionadas) ──
  let posOptions = '<option value="">— Selecione a rua —</option>';
  if (camaraVal && ruaVal && posicoesDisponiveis[camaraVal]?.ruas[String(ruaVal)]) {
    const posicoes = posicoesDisponiveis[camaraVal].ruas[String(ruaVal)].posicoes
      .sort((a, b) => a.posicao - b.posicao);
    posOptions = '<option value="">— Selecione a posição —</option>' +
      posicoes.map(pos => {
        const selected = destinoAtual?.posicao === pos.posicao ? 'selected' : '';
        return `<option value="${pos.posicao}" ${selected}>Posição ${pos.posicao}</option>`;
      }).join('');
  }

  const pid = palletId.replace(/[^a-zA-Z0-9_-]/g, '_');

  return `<div class="destino-selects" onclick="event.stopPropagation()">
    <div class="destino-selects-grid">
      <div class="field">
        <label>Câmara Sep.</label>
        <select id="sel-camara-${pid}" onchange="onChangeCamara('${palletId}', this.value)">
          <option value="">— Câmara —</option>
          ${camaraOptions}
        </select>
      </div>
      <div class="field">
        <label>Rua Sep.</label>
        <select id="sel-rua-${pid}" onchange="onChangeRua('${palletId}', this.value)" ${!camaraVal ? 'disabled' : ''}>
          ${ruaOptions}
        </select>
      </div>
      <div class="field">
        <label>Posição Sep.</label>
        <select id="sel-pos-${pid}" onchange="onChangePosicao('${palletId}', this.value)" ${!ruaVal ? 'disabled' : ''}>
          ${posOptions}
        </select>
      </div>
    </div>
  </div>`;
}

/* ─── handlers de cascata ───────────────────────────────────── */

function onChangeCamara(palletId, camaraVal) {
  // Limpa rua e posição ao mudar câmara
  if (destinosPorPallet[palletId]) {
    delete destinosPorPallet[palletId];
  }
  if (camaraVal) {
    destinosPorPallet[palletId] = { camara: camaraVal, rua: null, posicao: null };
  }

  const pid = palletId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const selRua = document.getElementById(`sel-rua-${pid}`);
  const selPos = document.getElementById(`sel-pos-${pid}`);
  if (!selRua || !selPos) return;

  // Atualiza select de rua
  if (!camaraVal || !posicoesDisponiveis[camaraVal]) {
    selRua.innerHTML = '<option value="">— Selecione a câmara —</option>';
    selRua.disabled = true;
    selPos.innerHTML = '<option value="">— Selecione a rua —</option>';
    selPos.disabled = true;
    atualizarContadorModal();
    atualizarBadgeDestino(palletId);
    return;
  }

  const ruas = Object.values(posicoesDisponiveis[camaraVal].ruas)
    .filter(r => r.livres > 0)
    .sort((a, b) => a.rua - b.rua);

  selRua.innerHTML = '<option value="">— Selecione a rua —</option>' +
    ruas.map(r => `<option value="${r.rua}">Rua ${r.rua} (Livres: ${r.livres}/${r.total})</option>`).join('');
  selRua.disabled = false;

  selPos.innerHTML = '<option value="">— Selecione a rua —</option>';
  selPos.disabled = true;

  atualizarContadorModal();
  atualizarBadgeDestino(palletId);
}

function onChangeRua(palletId, ruaVal) {
  const destino = destinosPorPallet[palletId] || {};
  destino.rua = ruaVal ? parseInt(ruaVal) : null;
  destino.posicao = null;
  destinosPorPallet[palletId] = destino;

  const pid = palletId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const selPos = document.getElementById(`sel-pos-${pid}`);
  if (!selPos) return;

  if (!ruaVal || !destino.camara || !posicoesDisponiveis[destino.camara]?.ruas[ruaVal]) {
    selPos.innerHTML = '<option value="">— Selecione a rua —</option>';
    selPos.disabled = true;
    atualizarContadorModal();
    atualizarBadgeDestino(palletId);
    return;
  }

  const posicoes = posicoesDisponiveis[destino.camara].ruas[ruaVal].posicoes
    .sort((a, b) => a.posicao - b.posicao);

  selPos.innerHTML = '<option value="">— Selecione a posição —</option>' +
    posicoes.map(pos => `<option value="${pos.posicao}">Posição ${pos.posicao}</option>`).join('');
  selPos.disabled = false;

  atualizarContadorModal();
  atualizarBadgeDestino(palletId);
}

function onChangePosicao(palletId, posVal) {
  const destino = destinosPorPallet[palletId] || {};
  destino.posicao = posVal ? parseInt(posVal) : null;
  destinosPorPallet[palletId] = destino;

  atualizarContadorModal();
  atualizarBadgeDestino(palletId);
}

/* ─── atualiza o badge de destino inline ────────────────────── */

function atualizarBadgeDestino(palletId) {
  const row = document.getElementById(`prow-${palletId}`);
  if (!row) return;
  const badge = row.querySelector('.destino-badge');
  if (!badge) return;

  const destino = destinosPorPallet[palletId];
  const valido = destino?.camara && destino?.rua && destino?.posicao;

  badge.className = `destino-badge ${valido ? 'destino-ok' : 'destino-pendente'}`;
  badge.textContent = valido
    ? `📍 C${destino.camara} · R${destino.rua} · P${destino.posicao}`
    : '⚠ Destino obrigatório';
}

/* ─── toggle seleção de pallet ──────────────────────────────── */

function togglePallet(id) {
  if (modalSelecionados.has(id)) {
    modalSelecionados.delete(id);
    delete destinosPorPallet[id];
  } else {
    modalSelecionados.add(id);
  }
  renderModalPallets();
  atualizarContadorModal();
  document.getElementById('chk-todos').checked = modalSelecionados.size === modalPallets.length;
}

function toggleSelecionarTodos() {
  if (modalSelecionados.size === modalPallets.length) {
    modalSelecionados = new Set();
    destinosPorPallet = {};
    document.getElementById('chk-todos').checked = false;
  } else {
    modalSelecionados = new Set(modalPallets.map(p => p.id));
    document.getElementById('chk-todos').checked = true;
  }
  renderModalPallets();
  atualizarContadorModal();
}

/* ─── contador e validação do botão ─────────────────────────── */

function atualizarContadorModal() {
  const count = modalSelecionados.size;
  document.getElementById('modal-sel-count').textContent = count;

  // Verifica se todos os selecionados têm destino válido
  const todosComDestino = count > 0 && [...modalSelecionados].every(id => {
    const d = destinosPorPallet[id];
    return d && d.camara && d.rua && d.posicao;
  });

  document.getElementById('btn-confirmar-oa').disabled = !todosComDestino;

  // Atualiza mensagem de validação
  const msgEl = document.getElementById('modal-validacao-msg');
  if (!msgEl) return;
  if (count === 0) {
    msgEl.textContent = 'Selecione ao menos um pallet.';
    msgEl.style.color = 'var(--muted)';
  } else if (!todosComDestino) {
    const semDestino = [...modalSelecionados].filter(id => {
      const d = destinosPorPallet[id];
      return !d || !d.camara || !d.rua || !d.posicao;
    }).length;
    msgEl.textContent = `${semDestino} pallet(s) sem destino definido.`;
    msgEl.style.color = 'var(--warning)';
  } else {
    msgEl.textContent = `${count} pallet(s) com destino definido. ✓`;
    msgEl.style.color = 'var(--success)';
  }
}

/* ─── fechar modal ──────────────────────────────────────────── */

function fecharModal(e) {
  if (e.target === document.getElementById('modal-overlay')) fecharModalDireto();
}

function fecharModalDireto() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

/* ─── confirmar criação da OA ───────────────────────────────── */

async function confirmarCriarOA() {
  if (!modalSelecionados.size) return;

  // Monta lista de destinos
  const destinos = [...modalSelecionados].map(pid => ({
    pallet_id: pid,
    camara: destinosPorPallet[pid].camara,
    rua: destinosPorPallet[pid].rua,
    posicao: destinosPorPallet[pid].posicao,
  }));

  try {
    const result = await api.post('/resfriamento/oa', {
      pallet_ids: Array.from(modalSelecionados),
      sessao_id: sessaoAtiva ? sessaoAtiva.id : null,
      destinos,
    });
    showToast(`OA ${result.oa_id} criada com ${result.pallets.length} pallet(s). Posições reservadas.`, 'success');
    fecharModalDireto();
    await renderOAs();
    await renderAguardandoOA();
  } catch(e) {
    showToast(e.message, 'error');
  }
}

/* ─── seleção de túnel ──────────────────────────────────────── */

async function selectTunel(tunel) {
  tunelAtivo = tunel;
  palletSelecionadoId = null;
  fecharDetalhe(false);
  document.getElementById('tab-t01').classList.toggle('active', tunel==='01');
  document.getElementById('tab-t02').classList.toggle('active', tunel==='02');
  document.getElementById('bocas-titulo').textContent = `Túnel ${tunel} — Bocas`;
  renderBocas();

  sessaoAtiva = null;
  try {
    const sessoes = await api.get(`/resfriamento/sessoes?tunel=${tunel}&status=ativa`);
    sessaoAtiva = Array.isArray(sessoes) && sessoes.length > 0 ? sessoes[0] : null;
  } catch(_) {}

  await renderSessaoBar();
  atualizarEncerrarBar();
}

/* ─── detalhe do pallet ─────────────────────────────────────── */

function abrirDetalhe(palletId, boca) {
  const todos = Object.values(dadosTuneis[tunelAtivo]||{}).flat();
  const p = todos.find(x => x.id === palletId);
  if (!p) return;

  palletSelecionadoId = palletId;
  renderBocas();

  document.getElementById('d-boca-num').textContent = `Boca ${String(boca).padStart(2,'0')}`;
  document.getElementById('d-pallet').textContent = `Pallet ${p.id}`;
  document.getElementById('d-var').textContent = `${p.variedade||'—'} · ${p.qtd_caixas!=null?p.qtd_caixas+' cx':'—'}`;
  document.getElementById('d-temp-entrada').textContent = `Entrada: ${p.temp_entrada!=null?p.temp_entrada+'°C':'—'}`;
  document.getElementById('d-produtor').textContent = p.produtor||'—';
  document.getElementById('d-class').textContent = p.classificacao||'—';
  document.getElementById('d-data-emb').textContent = p.data_embalamento
    ? new Date(p.data_embalamento).toLocaleDateString('pt-BR') : '—';
  document.getElementById('d-recepcao').textContent = p.created_at
    ? new Date(p.created_at).toLocaleString('pt-BR') : '—';
  document.getElementById('d-operador').textContent = p.created_at
    ? `Recepção: ${new Date(p.created_at).toLocaleString('pt-BR')}` : '—';
  document.getElementById('input-temp-polpa').value = p.temp_saida != null ? p.temp_saida : '';
  document.getElementById('input-obs').value = '';

  document.getElementById('detalhe-panel').classList.add('ativo');
  document.getElementById('detalhe-panel').scrollIntoView({behavior:'smooth',block:'nearest'});
}

function fecharDetalhe(rerender=true) {
  palletSelecionadoId = null;
  document.getElementById('detalhe-panel').classList.remove('ativo');
  if (rerender) renderBocas();
}

/* ─── salvar temperatura ────────────────────────────────────── */

document.getElementById('btn-salvar-temp').addEventListener('click', async () => {
  if (!palletSelecionadoId) return;
  const tempVal = parseFloat(document.getElementById('input-temp-polpa').value);
  if (isNaN(tempVal)) { showToast('Informe a temperatura de polpa.','error'); return; }
  const obs = document.getElementById('input-obs').value.trim();

  try {
    await api.post(`/resfriamento/pallet/${palletSelecionadoId}/temp`, {
      temp_polpa: tempVal,
      observacao: obs||null,
      sessao_id: sessaoAtiva ? sessaoAtiva.id : null,
    });
    Object.values(dadosTuneis[tunelAtivo]||{}).flat().forEach(p => {
      if (p.id === palletSelecionadoId) p.temp_saida = tempVal;
    });
    showToast(`Temperatura do pallet ${palletSelecionadoId} salva.`, 'success');
    fecharDetalhe(true);
  } catch(e) {
    showToast(e.message, 'error');
  }
});

/* ─── encerrar sessão ───────────────────────────────────────── */

async function encerrarSessao() {
  if (!sessaoAtiva) return;
  try {
    await api.post(`/resfriamento/sessao/${sessaoAtiva.id}/finalizar`, {});
    showToast('Sessão encerrada. Pallets aguardam vínculo a OA.', 'success');
    sessaoAtiva = null;
    fecharDetalhe(false);
    await init();
  } catch(e) {
    showToast(e.message, 'error');
  }
}

/* ─── init ──────────────────────────────────────────────────── */

async function init() {
  try {
    dadosTuneis = await api.get('/resfriamento/tuneis');
  } catch(e) {
    showToast('Erro ao carregar túneis: '+e.message,'error');
    dadosTuneis = {};
  }
  renderBocas();
  await selectTunel(tunelAtivo);
  await renderAguardandoOA();
  await renderOAs();
}

init();
