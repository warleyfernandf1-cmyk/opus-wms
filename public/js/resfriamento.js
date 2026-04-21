/**
 * resfriamento.js
 *
 * Fluxo:
 * 1. Pallets entram em resfriamento automaticamente pela Recepção.
 *    Sessão do túnel criada automaticamente ao registrar primeiro pallet.
 * 2. Operador registra temperatura de polpa por pallet (persiste imediatamente).
 * 3. Operador encerra sessão — apenas registra o fim do giro, NÃO move pallets.
 * 4. Pallets sem OA ficam em "Aguardando vínculo a OA".
 * 5. Operador cria OA selecionando pallets.
 * 6. Operador executa OA — backend valida temps + sessão encerrada → move para armazenamento.
 */

/* ─── estado ────────────────────────────────────────────────── */
let tunelAtivo = '01';
let palletSelecionadoId = null;
let dadosTuneis = {};
let sessaoAtiva = null;
let modalPallets = [];
let modalSelecionados = new Set();
let posLivresMap = {};   // { camara: { rua: [posicoes] } }
let palletDestinos = {}; // { pallet_id: { camara, rua, posicao } }

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
      const destinos = (oa.dados || {}).destinos || [];
      const destinosMap = Object.fromEntries(destinos.map(d => [d.pallet_id, d]));
      const criada = oa.criada_em ? new Date(oa.criada_em).toLocaleString('pt-BR') : '—';
      const executada = oa.status === 'executada';
      const programada = oa.status === 'programada';
      const badgeCls = executada ? 'oa-badge-executada' : programada ? 'oa-badge-programada' : 'oa-badge-pendente';
      const tags = pallets.map(p => {
        const d = destinosMap[p.id];
        const dest = d ? ` → C${d.camara} R${String(d.rua).padStart(2,'0')} P${String(d.posicao).padStart(2,'0')}` : '';
        return `<span class="oa-pallet-tag">${p.id}${dest}${p.temp_saida!=null?' ✓':' ⚠'}</span>`;
      }).join('');
      return `<div class="oa-card">
        <div class="oa-card-header">
          <span class="oa-id">${oa.id}</span>
          <div style="display:flex;gap:8px;align-items:center">
            <span class="oa-badge ${badgeCls}">${oa.status||'pendente'}</span>
            ${!executada ? `<button class="btn btn-primary btn-sm" onclick="executarOA('${oa.id}')">▶ Executar</button>` : ''}
          </div>
        </div>
        <div class="oa-meta">Criada em ${criada} · ${pallets.length} pallet(s) · Op: ${(oa.dados||{}).operador||'—'}</div>
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

/* ─── modal de criação de OA ────────────────────────────────── */

function buildPosLivresMap(positions) {
  const map = {};
  positions.filter(p => p.tipo === 'rua').forEach(p => {
    if (!map[p.camara]) map[p.camara] = {};
    if (!map[p.camara][p.rua]) map[p.camara][p.rua] = [];
    map[p.camara][p.rua].push(p.posicao);
  });
  return map;
}

async function abrirModalOA() {
  modalSelecionados = new Set();
  palletDestinos = {};
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.getElementById('modal-pallets-lista').innerHTML =
    '<span style="color:var(--text-muted);font-size:.82rem">Carregando pallets...</span>';
  document.getElementById('chk-todos').checked = false;
  atualizarContadorModal();

  try {
    [modalPallets, posLivres] = await Promise.all([
      api.get('/resfriamento/pallets-resfriamento'),
      api.get('/armazenamento/posicoes-livres'),
    ]);
    posLivresMap = buildPosLivresMap(posLivres);
    renderModalPallets();
  } catch(e) {
    document.getElementById('modal-pallets-lista').innerHTML =
      `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

function buildDestSelects(palletId) {
  const dest = palletDestinos[palletId] || {};

  const camaraOpts = Object.entries(posLivresMap).map(([cam, ruas]) => {
    const total = Object.values(ruas).flat().length;
    if (!total) return '';
    return `<option value="${cam}" ${dest.camara===cam?'selected':'"}>Câmara ${cam} (${total} livres)</option>`;
  }).join('');

  let ruaOpts = '<option value="">Rua…</option>';
  if (dest.camara && posLivresMap[dest.camara]) {
    ruaOpts += Object.entries(posLivresMap[dest.camara]).map(([rua, pos]) =>
      `<option value="${rua}" ${String(dest.rua)===rua?'selected':''}>R${String(rua).padStart(2,'0')} (${pos.length} livre${pos.length!==1?'s':''})</option>`
    ).join('');
  }

  let posOpts = '<option value="">Posição…</option>';
  if (dest.camara && dest.rua && posLivresMap[dest.camara]?.[dest.rua]) {
    posOpts += posLivresMap[dest.camara][dest.rua].map(pos =>
      `<option value="${pos}" ${dest.posicao===pos?'selected':''}>P${String(pos).padStart(2,'0')}</option>`
    ).join('');
  }

  const valid = dest.camara && dest.rua && dest.posicao;
  return `<div class="pallet-dest-row" onclick="event.stopPropagation()">
    <select class="dest-sel" onchange="onDestChange('${palletId}','camara',this.value)">
      <option value="">Câmara…</option>${camaraOpts}
    </select>
    <select class="dest-sel" ${!dest.camara?'disabled':''} onchange="onDestChange('${palletId}','rua',this.value)">${ruaOpts}</select>
    <select class="dest-sel" ${!dest.rua?'disabled':''} onchange="onDestChange('${palletId}','posicao',this.value)">${posOpts}</select>
    ${valid?'<span class="dest-valid">✔</span>':''}
  </div>`;
}

function onDestChange(palletId, field, value) {
  if (!palletDestinos[palletId]) palletDestinos[palletId] = {};
  if (field === 'camara') {
    palletDestinos[palletId] = { camara: value || undefined };
  } else if (field === 'rua') {
    palletDestinos[palletId].rua = value ? Number(value) : undefined;
    delete palletDestinos[palletId].posicao;
  } else {
    palletDestinos[palletId].posicao = value ? Number(value) : undefined;
  }
  renderModalPallets();
  atualizarContadorModal();
}

function renderModalPallets() {
  const lista = document.getElementById('modal-pallets-lista');
  if (!modalPallets.length) {
    lista.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhum pallet em resfriamento.</span>';
    return;
  }
  lista.innerHTML = modalPallets.map(p => {
    const sel = modalSelecionados.has(p.id);
    const temTemp = p.temp_saida != null;
    return `<div class="pallet-row ${sel?'selecionado':''}" onclick="togglePallet('${p.id}')">
      <input type="checkbox" ${sel?'checked':''} onclick="event.stopPropagation();togglePallet('${p.id}')">
      <div class="pallet-row-info" style="flex:1">
        <div class="pallet-row-id">Pallet ${p.id}</div>
        <div class="pallet-row-meta">${p.variedade||'—'} · ${p.qtd_caixas||'?'} cx · ${p.produtor||'—'} · T${p.tunel||'?'} Boca ${p.boca||'?'}</div>
        ${sel ? buildDestSelects(p.id) : ''}
      </div>
      <span class="pallet-row-temp ${temTemp?'ok':'sem'}">${temTemp?'Polpa: '+p.temp_saida+'°C ✓':'Sem temp.'}</span>
    </div>`;
  }).join('');
}

function togglePallet(id) {
  if (modalSelecionados.has(id)) { modalSelecionados.delete(id); delete palletDestinos[id]; }
  else modalSelecionados.add(id);
  renderModalPallets();
  atualizarContadorModal();
  document.getElementById('chk-todos').checked = modalSelecionados.size === modalPallets.length;
}

function toggleSelecionarTodos() {
  if (modalSelecionados.size === modalPallets.length) {
    modalSelecionados = new Set();
    palletDestinos = {};
    document.getElementById('chk-todos').checked = false;
  } else {
    modalSelecionados = new Set(modalPallets.map(p => p.id));
    document.getElementById('chk-todos').checked = true;
  }
  renderModalPallets();
  atualizarContadorModal();
}

function atualizarContadorModal() {
  document.getElementById('modal-sel-count').textContent = modalSelecionados.size;
  const allValid = modalSelecionados.size > 0 && [...modalSelecionados].every(id => {
    const d = palletDestinos[id];
    return d && d.camara && d.rua && d.posicao;
  });
  document.getElementById('btn-confirmar-oa').disabled = !allValid;
}

function fecharModal(e) {
  if (e.target === document.getElementById('modal-overlay')) fecharModalDireto();
}

function fecharModalDireto() {
  document.getElementById('modal-overlay').classList.add('hidden');
}

async function confirmarCriarOA() {
  if (!modalSelecionados.size) return;
  const operador = document.getElementById('modal-operador')?.value?.trim() || 'Operador';
  const destinos = [...modalSelecionados].map(id => ({ pallet_id: id, ...palletDestinos[id] }));
  try {
    const result = await api.post('/resfriamento/oa', {
      pallet_ids: Array.from(modalSelecionados),
      sessao_id: sessaoAtiva ? sessaoAtiva.id : null,
      destinos,
      operador,
    });
    showToast(`OA ${result.oa_id} programada com ${result.pallets.length} pallet(s).`, 'success');
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
