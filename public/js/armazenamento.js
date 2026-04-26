/**
 * armazenamento.js
 *
 * - Pallets aguardando vínculo a OA (sessão encerrada, sem OA).
 * - Criação e execução de Ordens de Armazenamento (OA).
 * - Listagem de pallets já em armazenamento.
 */

/* ─── estado ─────────────────────────────────────────────────── */
let modalPallets = [];
let modalSelecionados = new Set();
let posicoesDisponiveis = {};
let destinosPorPallet = {};
let execOaId = null;
let execOaDados = null;

/* ─── aguardando OA ──────────────────────────────────────────── */

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
            <td>${p.variedade || '—'}</td>
            <td><span class="badge-${(p.classificacao || '').toLowerCase() === 'good' ? 'good' : 'frutibras'}">${p.classificacao || '—'}</span></td>
            <td>T${p.tunel || '?'} · Boca ${p.boca || '?'}</td>
            <td>${p.temp_entrada != null ? p.temp_entrada + '°C' : '—'}</td>
            <td>${p.temp_saida != null ? p.temp_saida + '°C' : '<span style="color:#f59e0b">Pendente</span>'}</td>
            <td>${p.updated_at ? new Date(p.updated_at).toLocaleString('pt-BR') : '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    container.innerHTML = `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

/* ─── OAs ────────────────────────────────────────────────────── */

async function renderOAs() {
  const container = document.getElementById('oas-container');
  try {
    const oas = await api.get('/resfriamento/oas');
    if (!oas || !oas.length) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhuma OA criada ainda.</span>';
      return;
    }
    const badgeMap = {
      programada: 'oa-badge-programada',
      em_execucao: 'oa-badge-em_execucao',
      concluida: 'oa-badge-concluida',
      executada: 'oa-badge-concluida',
      pendente: 'oa-badge-pendente',
    };
    container.innerHTML = oas.map(oa => {
      const pallets = oa.pallets_detalhes || [];
      const destinos = (oa.dados || {}).destinos || [];
      const criada = oa.criada_em ? new Date(oa.criada_em).toLocaleString('pt-BR') : '—';
      const status = oa.status || 'programada';
      const concluida = status === 'concluida' || status === 'executada';
      const emExecucao = status === 'em_execucao';

      const tags = pallets.map(p => {
        const dest = destinos.find(d => d.pallet_id === p.id);
        const destLabel = dest ? ` → C${dest.camara}·R${dest.rua}·P${dest.posicao}` : '';
        return `<span class="oa-pallet-tag">${p.id}${destLabel}${p.temp_saida != null ? ' ✓' : ' ⚠'}</span>`;
      }).join('');

      const acoes = concluida
        ? `<button class="btn btn-ghost btn-sm" onclick="imprimirRelatorio('${oa.id}')">📄 PDF</button>`
        : `<button class="btn btn-ghost btn-sm" onclick="imprimirRelatorio('${oa.id}')">📄 PDF</button>
           <button class="btn btn-primary btn-sm" onclick="abrirModalExec('${oa.id}')">
             ${emExecucao ? '▶ Continuar' : '▶ Executar'}
           </button>`;

      return `<div class="oa-card" id="oa-card-${oa.id}">
        <div class="oa-card-header">
          <span class="oa-id">${oa.id}</span>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="oa-badge ${badgeMap[status] || 'oa-badge-programada'}">${status}</span>
            ${acoes}
          </div>
        </div>
        <div class="oa-meta">Criada em ${criada} · ${pallets.length} pallet(s)</div>
        <div class="oa-pallets">${tags || '<span style="opacity:.5">—</span>'}</div>
      </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

/* ─── Modal de execução de OA (bipagem) ──────────────────────── */

async function abrirModalExec(oaId) {
  execOaId = oaId;
  document.getElementById('modal-exec-overlay').classList.remove('hidden');
  document.getElementById('exec-oa-titulo').textContent = `Executar ${oaId}`;
  document.getElementById('exec-checklist').innerHTML =
    '<span style="color:var(--text-muted);font-size:.82rem">Iniciando...</span>';
  document.getElementById('btn-concluir-oa').disabled = true;
  document.getElementById('bip-alerta').className = 'bip-alerta';
  document.getElementById('bip-input').value = '';

  try {
    execOaDados = await api.post(`/resfriamento/oa/${oaId}/iniciar-execucao`, {});
    renderChecklist();
    setTimeout(() => document.getElementById('bip-input').focus(), 100);
  } catch (e) {
    showToast(e.message, 'error');
    fecharModalExec();
  }
}

function renderChecklist() {
  if (!execOaDados) return;
  const pallet_ids = (execOaDados.dados || {}).pallets || [];
  const destinos = (execOaDados.dados || {}).destinos || [];
  const bipados = execOaDados.itens_bipados || [];
  const total = pallet_ids.length;
  const count = bipados.length;

  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  document.getElementById('exec-progresso').textContent = `${count} / ${total}`;
  const barra = document.getElementById('exec-barra');
  barra.style.width = pct + '%';
  barra.className = 'bip-progress-bar' + (count === total ? ' completo' : '');

  document.getElementById('exec-checklist').innerHTML = pallet_ids.map(pid => {
    const bipado = bipados.includes(pid);
    const dest = destinos.find(d => d.pallet_id === pid);
    const destLabel = dest ? `C${dest.camara} · Rua ${dest.rua} · Posição ${dest.posicao}` : '—';
    return `<div class="bip-item ${bipado ? 'bipado' : ''}" id="bip-item-${pid}">
      <span class="bip-check">${bipado ? '✓' : '○'}</span>
      <div class="bip-item-info">
        <div class="bip-item-id">Pallet ${pid}</div>
        <div class="bip-item-dest">Destino: ${destLabel}</div>
      </div>
      ${bipado ? '<span style="font-size:.72rem;color:#22c55e;font-weight:600">Bipado</span>' : ''}
    </div>`;
  }).join('');

  const completo = count === total && total > 0;
  document.getElementById('btn-concluir-oa').disabled = !completo;
  document.getElementById('exec-foot-info').textContent = completo
    ? '✓ Todos os pallets conferidos. Clique em Concluir OA.'
    : `Bipe todos os pallets para habilitar a conclusão. (${total - count} pendente(s))`;
}

async function confirmarBipagem() {
  const input = document.getElementById('bip-input');
  const palletId = input.value.trim();
  if (!palletId || !execOaId) return;

  const alerta = document.getElementById('bip-alerta');

  try {
    const result = await api.post(`/resfriamento/oa/${execOaId}/bipar`, { pallet_id: palletId });
    if (!execOaDados.itens_bipados) execOaDados.itens_bipados = [];
    execOaDados.itens_bipados.push(palletId);

    input.value = '';
    input.className = 'bip-input ok';
    alerta.className = 'bip-alerta ok';
    alerta.textContent = `✓ Pallet ${palletId} confirmado!`;
    tocarSom('ok');
    setTimeout(() => { input.className = 'bip-input'; alerta.className = 'bip-alerta'; }, 1500);

    renderChecklist();
    if (result.completo) {
      alerta.className = 'bip-alerta ok';
      alerta.textContent = '✓ Todos os pallets bipados! Clique em Concluir OA.';
      tocarSom('completo');
    }
  } catch (e) {
    input.className = 'bip-input erro';
    alerta.className = 'bip-alerta erro';
    alerta.textContent = `✗ ${e.message}`;
    tocarSom('erro');
    setTimeout(() => { input.className = 'bip-input'; }, 800);
  }
  input.focus();
}

function tocarSom(tipo) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    if (tipo === 'ok') {
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.3, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
    } else if (tipo === 'completo') {
      osc.frequency.value = 1200;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    } else {
      osc.frequency.value = 220;
      gain.gain.setValueAtTime(0.4, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
    }
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.3);
  } catch (_) {}
}

async function concluirOA() {
  if (!execOaId) return;
  try {
    await api.post(`/resfriamento/oa/${execOaId}/concluir`, {});
    showToast(`OA ${execOaId} concluída! Pallets movidos para armazenamento.`, 'success');
    fecharModalExec();
    await init();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

function fecharModalExec() {
  document.getElementById('modal-exec-overlay').classList.add('hidden');
  execOaId = null;
  execOaDados = null;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('bip-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') confirmarBipagem();
  });
});

/* ─── PDF de apoio ───────────────────────────────────────────── */

// Posições do corredor que são gap (porta), por câmara — DB posicao sequencial
const _OA_GAPS = { '01': new Set([7, 8]), '02': new Set([1, 2]) };
const _MAP_RUAS = 13;
const _MAP_POS  = 6;

function _corEffPos(camId) {
  // Array[_MAP_RUAS]: null = gap, número = posição efetiva (R01=1, da direita)
  const gaps = _OA_GAPS[camId] || new Set();
  const res = new Array(_MAP_RUAS).fill(null);
  let eff = 0;
  for (let c = _MAP_RUAS - 1; c >= 0; c--) {
    if (!gaps.has(c + 1)) { eff++; res[c] = eff; }
  }
  return res;
}

async function imprimirRelatorio(oaId) {
  try {
    const oas = await api.get('/resfriamento/oas');
    const oa  = oas.find(o => o.id === oaId);
    if (!oa) { showToast('OA não encontrada', 'error'); return; }

    const pallets     = oa.pallets_detalhes || [];
    const destinos    = (oa.dados || {}).destinos || [];
    const criada      = oa.criada_em ? new Date(oa.criada_em).toLocaleString('pt-BR') : '—';
    const totalCaixas = pallets.reduce((s, p) => s + (p.qtd_caixas || 0), 0);

    // Mapa rápido: "camara-rua-posicao" → pallet_id
    const destMap = {};
    for (const d of destinos) destMap[`${d.camara}-${d.rua}-${d.posicao}`] = d.pallet_id;

    // Câmaras com pelo menos um destino nesta OA
    const camaras = [...new Set(destinos.map(d => d.camara))].sort();

    // ── Página 1: Rateio ─────────────────────────────────────────
    const rateioRows = pallets.map((p, i) => {
      const dest    = destinos.find(d => d.pallet_id === p.id);
      const origem  = `T${p.tunel || '?'} - B${p.boca || '?'}`;
      const destLbl = dest
        ? `CF${dest.camara} - R${String(dest.rua).padStart(2,'0')} - P${String(dest.posicao).padStart(2,'0')}`
        : '—';
      return `<tr>
        <td>${i + 1}</td>
        <td><strong>${p.id}</strong></td>
        <td>${p.variedade     || '—'}</td>
        <td>${p.classificacao || '—'}</td>
        <td>${p.embalagem     || '—'}</td>
        <td>${p.produtor      || '—'}</td>
        <td>${p.qtd_caixas    || '—'}</td>
        <td>${p.area          || '—'}</td>
        <td>${p.mercado       || '—'}</td>
        <td>${origem}</td>
        <td class="td-destino">${destLbl}</td>
      </tr>`;
    }).join('');

    // ── Página 2: Mapa de câmaras ─────────────────────────────────
    const mapasHtml = camaras.map(cam => {
      const eff = _corEffPos(cam);

      // Cabeçalho das ruas (R13 → R01)
      const headCols = Array.from({length: _MAP_RUAS}, (_, c) =>
        `<th>R${String(_MAP_RUAS - c).padStart(2,'0')}</th>`
      ).join('');

      // Linha do corredor
      const coRow = `<tr>
        <th class="row-lbl" style="color:#b45309">CO</th>
        ${eff.map(ep => ep !== null
          ? `<td class="co-num">${String(ep).padStart(2,'0')}</td>`
          : `<td class="co-gap"></td>`
        ).join('')}
      </tr>`;

      // Linhas P01–P06
      const posRows = Array.from({length: _MAP_POS}, (_, pi) => {
        const pos = pi + 1;
        const cells = Array.from({length: _MAP_RUAS}, (_, c) => {
          const rua = _MAP_RUAS - c;
          const pid = destMap[`${cam}-${rua}-${pos}`];
          return pid
            ? `<td class="map-destino">${pid}</td>`
            : `<td></td>`;
        }).join('');
        return `<tr><th class="row-lbl">P${String(pos).padStart(2,'0')}</th>${cells}</tr>`;
      }).join('');

      return `<div class="pdf-map-section">
        <div class="pdf-map-cam-title">CÂMARA ${cam}</div>
        <table class="pdf-map-table">
          <thead><tr><th class="row-lbl"></th>${headCols}</tr></thead>
          <tbody>${coRow}${posRows}</tbody>
        </table>
      </div>`;
    }).join('');

    // ── Montar HTML completo ──────────────────────────────────────
    document.getElementById('pdf-apoio').innerHTML = `
      <div class="pdf-page">
        <div class="pdf-header">
          <div class="pdf-logo">Opus WMS<span>Warehouse Management</span></div>
          <div style="text-align:right;line-height:1.6">
            <div style="font-size:.7rem;color:#666">${criada}</div>
            <div style="font-size:1rem;font-weight:700">${oaId}</div>
          </div>
        </div>
        <div class="pdf-doc-title">ORDEM DE ARMAZENAMENTO</div>
        <div class="pdf-summary">
          <div class="pdf-summary-box">
            <div class="pdf-summary-label">TOTAL DE PALLETS</div>
            <div class="pdf-summary-value">${pallets.length}</div>
          </div>
          <div class="pdf-summary-box">
            <div class="pdf-summary-label">TOTAL DE CAIXAS</div>
            <div class="pdf-summary-value">${totalCaixas}</div>
          </div>
        </div>
        <div class="pdf-section-title">RATEIO DOS PALLETS</div>
        <table class="pdf-table">
          <thead>
            <tr>
              <th>Nº</th><th>PALLET</th><th>VARIEDADE</th><th>CLASSIF.</th>
              <th>EMBALAGEM</th><th>PRODUTOR</th><th>CAIXAS</th>
              <th>ÁREA</th><th>MERCADO</th><th>POS. ORIGEM</th><th>POS. DESTINO</th>
            </tr>
          </thead>
          <tbody>${rateioRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="6" style="text-align:right;font-size:.58rem;letter-spacing:.05em">TOTAL</td>
              <td>${totalCaixas}</td>
              <td colspan="4"></td>
            </tr>
          </tfoot>
        </table>
        <div style="font-size:.62rem;color:#666;margin-bottom:14px">
          Total Pallets: <strong>${pallets.length}</strong> &nbsp;&nbsp; Total Caixas: <strong>${totalCaixas}</strong>
        </div>
        <div class="pdf-footer-sign">
          <div class="pdf-assinatura">Separador / Operador</div>
          <div class="pdf-assinatura">Responsável</div>
        </div>
      </div>

      <div class="pdf-page">
        <div class="pdf-header">
          <div class="pdf-logo">Opus WMS<span>Warehouse Management</span></div>
          <div style="text-align:right;line-height:1.6">
            <div style="font-size:.7rem;color:#666">${criada}</div>
            <div style="font-size:.7rem;color:#666">${oaId}</div>
          </div>
        </div>
        <div class="pdf-doc-title">MAPA DE CÂMARAS</div>
        <div style="font-size:.72rem;color:#666;margin-bottom:12px">${oaId}</div>
        <div class="pdf-legend">
          <div class="pdf-legend-item">
            <div class="pdf-legend-box pdf-legend-destino"></div>
            <span>Posição de Destino (Armazenamento)</span>
          </div>
          <div class="pdf-legend-item">
            <div class="pdf-legend-box pdf-legend-vazio"></div>
            <span>Vazio</span>
          </div>
        </div>
        ${mapasHtml || '<p style="color:#999;font-size:.8rem">Nenhum destino definido para esta OA.</p>'}
      </div>
    `;

    window.print();
  } catch (e) {
    showToast('Erro ao gerar PDF: ' + e.message, 'error');
  }
}

/* ─── Modal de criação de OA ─────────────────────────────────── */

async function abrirModalOA() {
  modalSelecionados = new Set();
  destinosPorPallet = {};
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-pallets-lista').innerHTML =
    '<span style="color:var(--text-muted);font-size:.82rem">Carregando pallets...</span>';
  document.getElementById('chk-todos').checked = false;
  atualizarContadorModal();

  try {
    [modalPallets, posicoesDisponiveis] = await Promise.all([
      api.get('/resfriamento/pallets-resfriamento'),
      api.get('/resfriamento/posicoes-disponiveis'),
    ]);
    renderModalPallets();
  } catch (e) {
    document.getElementById('modal-pallets-lista').innerHTML =
      `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

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
    const destinoValido = destino?.camara && destino?.rua && destino?.posicao;
    const selectsHtml = sel ? renderDestinoPallet(p.id, destino) : '';

    return `<div class="pallet-row ${sel ? 'selecionado' : ''}" id="prow-${p.id}">
      <div class="pallet-row-top" onclick="togglePallet('${p.id}')">
        <input type="checkbox" ${sel ? 'checked' : ''} onclick="event.stopPropagation();togglePallet('${p.id}')">
        <div class="pallet-row-info">
          <div class="pallet-row-id">Pallet ${p.id}</div>
          <div class="pallet-row-meta">${p.variedade || '—'} · ${p.qtd_caixas || '?'} cx · ${p.produtor || '—'} · T${p.tunel || '?'} Boca ${p.boca || '?'}</div>
        </div>
        <span class="pallet-row-temp ${temTemp ? 'ok' : 'sem'}">
          ${temTemp ? 'Polpa: ' + p.temp_saida + '°C ✓' : 'Sem temp.'}
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

function renderDestinoPallet(palletId, destinoAtual) {
  const camaras = Object.keys(posicoesDisponiveis).sort();

  if (!camaras.length) {
    return `<div class="destino-selects">
      <span style="color:var(--danger);font-size:.78rem">⚠ Nenhuma posição livre disponível nas câmaras.</span>
    </div>`;
  }

  const camaraOptions = camaras.map(c => {
    const cam = posicoesDisponiveis[c];
    const disabled = cam.livres === 0 ? 'disabled' : '';
    const selected = destinoAtual?.camara === c ? 'selected' : '';
    return `<option value="${c}" ${disabled} ${selected}>Câmara ${c} (Livres: ${cam.livres}/${cam.total})</option>`;
  }).join('');

  const camaraVal = destinoAtual?.camara || '';

  let ruaOptions = '<option value="">— Selecione a câmara —</option>';
  if (camaraVal && posicoesDisponiveis[camaraVal]) {
    const ruas = Object.values(posicoesDisponiveis[camaraVal].ruas)
      .filter(r => r.livres > 0)
      .sort((a, b) => a.rua - b.rua);
    ruaOptions = '<option value="">— Selecione a rua —</option>' +
      ruas.map(r => {
        const selected = destinoAtual?.rua === r.rua ? 'selected' : '';
        return `<option value="${r.rua}" ${selected}>Rua ${r.rua} (Livres: ${r.livres}/${r.total})</option>`;
      }).join('');
  }

  const ruaVal = destinoAtual?.rua || '';

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

function onChangeCamara(palletId, camaraVal) {
  if (destinosPorPallet[palletId]) delete destinosPorPallet[palletId];
  if (camaraVal) destinosPorPallet[palletId] = { camara: camaraVal, rua: null, posicao: null };

  const pid = palletId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const selRua = document.getElementById(`sel-rua-${pid}`);
  const selPos = document.getElementById(`sel-pos-${pid}`);
  if (!selRua || !selPos) return;

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

function atualizarContadorModal() {
  const count = modalSelecionados.size;
  document.getElementById('modal-sel-count').textContent = count;

  const todosComDestino = count > 0 && [...modalSelecionados].every(id => {
    const d = destinosPorPallet[id];
    return d && d.camara && d.rua && d.posicao;
  });

  document.getElementById('btn-confirmar-oa').disabled = !todosComDestino;

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

function fecharModal(e) {
  if (e.target === document.getElementById('modal-overlay')) fecharModalDireto();
}

function fecharModalDireto() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function confirmarCriarOA() {
  if (!modalSelecionados.size) return;

  const destinos = [...modalSelecionados].map(pid => ({
    pallet_id: pid,
    camara: destinosPorPallet[pid].camara,
    rua: destinosPorPallet[pid].rua,
    posicao: destinosPorPallet[pid].posicao,
  }));

  try {
    const result = await api.post('/resfriamento/oa', {
      pallet_ids: Array.from(modalSelecionados),
      sessao_id: null,
      destinos,
    });
    showToast(`OA ${result.oa_id} criada com ${result.pallets.length} pallet(s). Posições reservadas.`, 'success');
    fecharModalDireto();
    await renderOAs();
    await renderAguardandoOA();
    await imprimirRelatorio(result.oa_id);
  } catch (e) {
    showToast(e.message, 'error');
  }
}

/* ─── Pallets em Armazenamento ───────────────────────────────── */

async function loadPalletsArmazenados() {
  const tbody = document.getElementById('tbody-armazenamento');
  try {
    const pallets = await api.get('/armazenamento/pallets');
    if (!pallets || !pallets.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-muted">Nenhum pallet armazenado.</td></tr>';
      return;
    }
    tbody.innerHTML = pallets.map(p => `<tr>
      <td style="font-weight:600">${p.id}</td>
      <td>${p.variedade || '—'}</td>
      <td>${p.classificacao || '—'}</td>
      <td>${p.qtd_caixas || '—'}</td>
      <td>${p.camara || '—'}</td>
      <td>${p.rua || '—'}</td>
      <td>${p.posicao || '—'}</td>
    </tr>`).join('');
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="7" style="color:var(--danger)">Erro: ${e.message}</td></tr>`;
  }
}

/* ─── init ───────────────────────────────────────────────────── */

async function init() {
  await Promise.all([
    renderAguardandoOA(),
    renderOAs(),
    loadPalletsArmazenados(),
  ]);
}

init();
