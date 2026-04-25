/**
 * resfriamento.js
 *
 * Fluxo:
 * 1. Pallets entram em resfriamento automaticamente pela Recepção.
 * 2. Operador registra temperatura de polpa por pallet (persiste imediatamente).
 * 3. Operador encerra sessão — registra o fim do giro, NÃO move pallets.
 * 4. Criação e execução de OA são gerenciadas no módulo Armazenamento.
 */

/* ─── estado ─────────────────────────────────────────────────── */
let tunelAtivo = '01';
let palletSelecionadoId = null;
let dadosTuneis = {};
let sessaoAtiva = null;
let fotoSaidaUrl = null;

/* ─── helpers ────────────────────────────────────────────────── */

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

/* ─── bocas ──────────────────────────────────────────────────── */

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
        const cls = ['boca-card', 'ocupada', sel ? 'selecionada' : '', temTemp ? 'com-temp' : ''].filter(Boolean).join(' ');
        cards.push(`<div class="${cls}" onclick="abrirDetalhe('${p.id}',${b})">
          <span class="boca-num">Boca ${b}</span>
          <span class="boca-pallet">${p.id}</span>
          <span class="boca-var">${p.variedade || '—'}</span>
          <span class="boca-temp">${p.temp_entrada != null ? p.temp_entrada + '°C' : '—'}</span>
          ${temTemp ? `<span class="boca-temp-saida">Polpa: ${p.temp_saida}°C ✓</span>` : ''}
        </div>`);
      });
    }
  }
  grid.innerHTML = cards.join('');
  atualizarEncerrarBar();
}

/* ─── barra encerrar sessão ──────────────────────────────────── */

function atualizarEncerrarBar() {
  const bar = document.getElementById('encerrar-bar');
  const btn = document.getElementById('btn-encerrar-sessao');
  const info = document.getElementById('encerrar-info');
  const todos = palletsDoTunel();

  if (!sessaoAtiva || sessaoAtiva.status !== 'ativa' || todos.length === 0) { bar.style.display = 'none'; return; }

  bar.style.display = 'flex';
  const comTemp = todos.filter(p => p.temp_saida != null).length;
  const total = todos.length;
  const ok = comTemp === total;

  info.innerHTML = ok
    ? `<span>${total}/${total}</span> pallets com temperatura — pronto para encerrar sessão`
    : `<span>${comTemp}/${total}</span> pallets com temperatura registrada`;
  btn.disabled = !ok;
}

/* ─── barra de sessão ────────────────────────────────────────── */

async function renderSessaoBar() {
  const bar = document.getElementById('sessao-bar');
  const btnRel = document.getElementById('btn-relatorio-sessao');

  if (!sessaoAtiva) {
    bar.style.display = 'none';
    btnRel.style.display = 'none';
    return;
  }

  let remessa = 1;
  try {
    const todas = await api.get(`/resfriamento/sessoes?tunel=${tunelAtivo}`);
    const hoje = new Date().toISOString().slice(0, 10);
    remessa = todas.filter(s => s.iniciado_em?.startsWith(hoje)).length;
  } catch (_) {}

  const criada = sessaoAtiva.iniciado_em
    ? new Date(sessaoAtiva.iniciado_em).toLocaleString('pt-BR') : '—';
  document.getElementById('sessao-label').textContent = labelSessao(tunelAtivo, remessa);
  document.getElementById('sessao-info').textContent =
    `Criada em ${criada} · Pallets: ${palletsDoTunel().length}`;
  bar.style.display = 'flex';

  btnRel.style.display = sessaoAtiva.status === 'finalizada' ? '' : 'none';
}

/* ─── seleção de túnel ───────────────────────────────────────── */

async function selectTunel(tunel) {
  tunelAtivo = tunel;
  palletSelecionadoId = null;
  fecharDetalhe(false);
  document.getElementById('tab-t01').classList.toggle('active', tunel === '01');
  document.getElementById('tab-t02').classList.toggle('active', tunel === '02');
  document.getElementById('bocas-titulo').textContent = `Túnel ${tunel} — Bocas`;
  renderBocas();

  sessaoAtiva = null;
  try {
    const ativas = await api.get(`/resfriamento/sessoes?tunel=${tunel}&status=ativa`);
    if (Array.isArray(ativas) && ativas.length > 0) {
      sessaoAtiva = ativas[0];
    } else {
      // Sem sessão ativa — carrega a última finalizada para permitir gerar o relatório
      const finalizadas = await api.get(`/resfriamento/sessoes?tunel=${tunel}&status=finalizada`);
      if (Array.isArray(finalizadas) && finalizadas.length > 0) {
        finalizadas.sort((a, b) =>
          new Date(b.finalizado_em || b.iniciado_em) - new Date(a.finalizado_em || a.iniciado_em)
        );
        sessaoAtiva = finalizadas[0];
      }
    }
  } catch (_) {}

  await renderSessaoBar();
  atualizarEncerrarBar();
}

/* ─── detalhe do pallet ──────────────────────────────────────── */

function abrirDetalhe(palletId, boca) {
  const todos = Object.values(dadosTuneis[tunelAtivo] || {}).flat();
  const p = todos.find(x => x.id === palletId);
  if (!p) return;

  palletSelecionadoId = palletId;
  renderBocas();

  document.getElementById('d-boca-num').textContent = `Boca ${String(boca).padStart(2, '0')}`;
  document.getElementById('d-pallet').textContent = `Pallet ${p.id}`;
  document.getElementById('d-var').textContent = `${p.variedade || '—'} · ${p.qtd_caixas != null ? p.qtd_caixas + ' cx' : '—'}`;
  document.getElementById('d-temp-entrada').textContent = `Entrada: ${p.temp_entrada != null ? p.temp_entrada + '°C' : '—'}`;
  document.getElementById('d-produtor').textContent = p.produtor || '—';
  document.getElementById('d-class').textContent = p.classificacao || '—';
  document.getElementById('d-data-emb').textContent = p.data_embalamento
    ? new Date(p.data_embalamento).toLocaleDateString('pt-BR') : '—';
  document.getElementById('d-recepcao').textContent = p.created_at
    ? new Date(p.created_at).toLocaleString('pt-BR') : '—';
  document.getElementById('d-operador').textContent = p.created_at
    ? `Recepção: ${new Date(p.created_at).toLocaleString('pt-BR')}` : '—';
  document.getElementById('input-temp-polpa').value = p.temp_saida != null ? p.temp_saida : '';
  document.getElementById('input-obs').value = '';

  document.getElementById('detalhe-panel').classList.add('ativo');
  document.getElementById('detalhe-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fecharDetalhe(rerender = true) {
  palletSelecionadoId = null;
  fotoSaidaUrl  = null;
  fotoSaidaPath = null;
  ['preview-temp-saida', 'status-temp-saida', 'remover-temp-saida'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if (id.startsWith('preview')) { el.src = ''; el.classList.remove('visible'); }
    else if (id.startsWith('status')) { el.className = 'foto-status'; el.textContent = ''; }
    else el.classList.remove('visible');
  });
  const input = document.getElementById('foto-temp-saida');
  if (input) input.value = '';
  document.getElementById('detalhe-panel').classList.remove('ativo');
  if (rerender) renderBocas();
}

/* ─── foto de saída ──────────────────────────────────────────── */

let fotoSaidaPath = null;

async function _limparArquivoSaida() {
  if (!fotoSaidaPath) return;
  try {
    const token = sessionStorage.getItem('token');
    await fetch('/api/upload/limpar', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify([fotoSaidaPath]),
    });
  } catch (_) {}
}

async function uploadFotoSaida(file) {
  const statusEl  = document.getElementById('status-temp-saida');
  const previewEl = document.getElementById('preview-temp-saida');
  const removerEl = document.getElementById('remover-temp-saida');
  statusEl.className = 'foto-status uploading';
  statusEl.textContent = '⏳ Enviando…';
  previewEl.src = URL.createObjectURL(file);
  previewEl.classList.add('visible');
  removerEl.classList.remove('visible');

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', 'saida');
    const token = sessionStorage.getItem('token');
    const resp = await fetch('/api/upload/foto', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      throw new Error(err.detail || 'Erro no upload');
    }
    const data = await resp.json();
    fotoSaidaUrl  = data.url;
    fotoSaidaPath = data.path;
    statusEl.className = 'foto-status ok';
    statusEl.textContent = '✔ Foto enviada';
    removerEl.classList.add('visible');
  } catch (e) {
    fotoSaidaUrl  = null;
    fotoSaidaPath = null;
    statusEl.className = 'foto-status erro';
    statusEl.textContent = '✖ Falha: ' + e.message;
  }
}

async function removerFotoSaida() {
  await _limparArquivoSaida();
  fotoSaidaUrl  = null;
  fotoSaidaPath = null;
  const previewEl = document.getElementById('preview-temp-saida');
  const statusEl  = document.getElementById('status-temp-saida');
  const removerEl = document.getElementById('remover-temp-saida');
  previewEl.src = ''; previewEl.classList.remove('visible');
  statusEl.className = 'foto-status'; statusEl.textContent = '';
  removerEl.classList.remove('visible');
  document.getElementById('foto-temp-saida').value = '';
}

/* ─── salvar temperatura ─────────────────────────────────────── */

document.getElementById('btn-salvar-temp').addEventListener('click', async () => {
  if (!palletSelecionadoId) return;
  const tempVal = parseFloat(document.getElementById('input-temp-polpa').value);
  if (isNaN(tempVal)) { showToast('Informe a temperatura de polpa.', 'error'); return; }
  const obs = document.getElementById('input-obs').value.trim();

  const payload = {
    temp_polpa: tempVal,
    observacao: obs || null,
    sessao_id: sessaoAtiva ? sessaoAtiva.id : null,
  };
  if (fotoSaidaUrl) payload.foto_temp_saida = fotoSaidaUrl;

  try {
    await api.post(`/resfriamento/pallet/${palletSelecionadoId}/temp`, payload);
    Object.values(dadosTuneis[tunelAtivo] || {}).flat().forEach(p => {
      if (p.id === palletSelecionadoId) p.temp_saida = tempVal;
    });
    showToast(`Temperatura do pallet ${palletSelecionadoId} salva.`, 'success');
    fecharDetalhe(true);
  } catch (e) {
    showToast(e.message, 'error');
  }
});

/* ─── encerrar sessão ────────────────────────────────────────── */

async function encerrarSessao() {
  if (!sessaoAtiva) return;
  try {
    const sessaoFinalizada = await api.post(`/resfriamento/sessao/${sessaoAtiva.id}/finalizar`, {});
    showToast('Sessão encerrada. Pallets aguardam vínculo a OA no módulo Armazenamento.', 'success');
    sessaoAtiva = sessaoFinalizada || { ...sessaoAtiva, status: 'finalizada' };
    fecharDetalhe(false);
    await renderSessaoBar();
    atualizarEncerrarBar();
    renderBocas();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

/* ─── gerar relatório ────────────────────────────────────────── */

const _LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 72">
  <defs>
    <linearGradient id="rg1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#5bbfd8"/><stop offset="100%" stop-color="#1a7abf"/>
    </linearGradient>
    <linearGradient id="rg2" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#1a8abf"/><stop offset="100%" stop-color="#0a5a9f"/>
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="76" height="25" rx="2" fill="url(#rg1)"/>
  <line x1="11" y1="14.5" x2="50" y2="14.5" stroke="white" stroke-width="4" stroke-dasharray="8 5"/>
  <polygon points="54,8 68,14.5 54,21" fill="white"/>
  <rect x="2" y="31" width="76" height="25" rx="2" fill="url(#rg2)"/>
  <line x1="69" y1="43.5" x2="30" y2="43.5" stroke="white" stroke-width="4" stroke-dasharray="8 5"/>
  <polygon points="26,37 12,43.5 26,50" fill="white"/>
  <rect x="0" y="61" width="80" height="8" rx="1" fill="#1a4a7a"/>
  <rect x="11" y="56" width="10" height="5" fill="#1a4a7a"/>
  <rect x="35" y="56" width="10" height="5" fill="#1a4a7a"/>
  <rect x="59" y="56" width="10" height="5" fill="#1a4a7a"/>
</svg>`;

function _fmt(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch (_) { return iso; }
}

function _fmtDate(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleDateString('pt-BR'); } catch (_) { return iso; }
}

function _fotoCol(label, url, ts, op) {
  const cap = [ts ? _fmt(ts) : null, op || null].filter(Boolean).join(' · ') || '—';
  return `<div class="rel-foto-col">
    <div class="rel-foto-lbl">${label}</div>
    <div class="rel-foto-img">
      ${url
        ? `<img src="${url}" alt="${label}">`
        : `<div class="sem-img">Sem imagem registrada</div>`}
    </div>
    <div class="rel-foto-caption">${cap}</div>
  </div>`;
}

async function gerarRelatorio() {
  if (!sessaoAtiva) return;
  const sessaoId = sessaoAtiva.id;

  try {
    showToast('Gerando relatório…', 'success');
    const data = await api.get(`/resfriamento/sessao/${sessaoId}/relatorio`);
    const { sessao, pallets, estatisticas } = data;

    // Label da sessão
    let sessaoLabel = `T${sessao.tunel}`;
    try {
      const todas = await api.get(`/resfriamento/sessoes?tunel=${sessao.tunel}`);
      const dia = (sessao.iniciado_em || '').slice(0, 10);
      const remessa = todas.filter(s => (s.iniciado_em || '').startsWith(dia)).length;
      sessaoLabel = labelSessao(sessao.tunel, remessa);
    } catch (_) {}

    // Operadores da sessão (mais frequentes)
    const opRecepcao = pallets.find(p => p.operador_recepcao)?.operador_recepcao || '—';
    const opResfriamento = pallets.find(p => p.operador_saida)?.operador_saida || '—';

    const e = estatisticas;
    const palletsHtml = pallets.map(p => `
      <div class="rel-pallet">
        <div class="rel-pallet-hdr">
          <div class="rel-pallet-id">PALLET ${p.id}</div>
          <div class="rel-pallet-desc">${p.variedade || '—'} · ${p.classificacao || '—'} · ${p.qtd_caixas != null ? p.qtd_caixas + ' cx' : '—'}</div>
          <div class="rel-pallet-ops">
            <div><div class="lbl">ENTRADA</div><div class="val">${_fmt(p.ts_recepcao)}</div></div>
            <div><div class="lbl">SAÍDA</div><div class="val">${_fmt(p.ts_saida)}</div></div>
            <div><div class="lbl">RECEPÇÃO</div><div class="val">${p.operador_recepcao || '—'}</div></div>
            <div><div class="lbl">RESFRIAMENTO</div><div class="val">${p.operador_saida || '—'}</div></div>
          </div>
        </div>
        <div class="rel-metrics">
          <div class="rel-metric">
            <div class="lbl">TEMPERATURA DE ENTRADA</div>
            <div class="val">${p.temp_entrada != null ? p.temp_entrada + ' °C' : '—'}</div>
          </div>
          <div class="rel-metric">
            <div class="lbl">BOCA</div>
            <div class="val">Boca ${p.boca || '—'}</div>
          </div>
          <div class="rel-metric">
            <div class="lbl">TEMPERATURA DE SAÍDA</div>
            <div class="val">${p.temp_saida != null ? p.temp_saida + ' °C' : '—'}</div>
          </div>
        </div>
        <div class="rel-fotos">
          ${_fotoCol('TEMP. ENTRADA',    p.foto_temp_entrada,   p.ts_recepcao, p.operador_recepcao)}
          ${_fotoCol('ESPELHO DO PALLET', p.foto_espelho,        p.ts_recepcao, p.operador_recepcao)}
          ${_fotoCol('FOTO DO PALLET',   p.foto_pallet_entrada, p.ts_recepcao, p.operador_recepcao)}
          ${_fotoCol('TEMP. SAÍDA',      p.foto_temp_saida,     p.ts_saida,    p.operador_saida)}
        </div>
      </div>
    `).join('');

    const html = `<div class="rel-doc">
      <div class="rel-session-hdr">
        <div class="rel-logo-wrap">
          ${_LOGO_SVG}
          <div class="rel-logo-text">
            <div class="t1">Relatório de Recepção / Resfriamento</div>
            <div class="t2">${sessaoLabel}</div>
          </div>
        </div>
        <div class="rel-session-meta">
          <div><div class="lbl">DATA/HORA DE ENTRADA</div><div class="val">${_fmt(sessao.iniciado_em)}</div></div>
          <div><div class="lbl">DATA/HORA DE SAÍDA</div><div class="val">${_fmt(sessao.finalizado_em)}</div></div>
          <div><div class="lbl">OPERADOR RECEPÇÃO</div><div class="val">${opRecepcao}</div></div>
          <div><div class="lbl">OPERADOR RESFRIAMENTO</div><div class="val">${opResfriamento}</div></div>
        </div>
      </div>
      <div class="rel-stats">
        <div class="rel-stat-box"><div class="lbl">TÚNEL</div><div class="val">TÚNEL ${sessao.tunel}</div></div>
        <div class="rel-stat-box"><div class="lbl">SESSÃO</div><div class="val">${sessaoLabel}</div></div>
        <div class="rel-stat-box"><div class="lbl">PALLETS</div><div class="val">${e.total_pallets}</div></div>
        <div class="rel-stat-box"><div class="lbl">TEMP. MÉDIA ENTRADA</div><div class="val">${e.temp_media_entrada != null ? e.temp_media_entrada + ' °C' : '—'}</div></div>
        <div class="rel-stat-box"><div class="lbl">TEMP. MÉDIA SAÍDA</div><div class="val">${e.temp_media_saida != null ? e.temp_media_saida + ' °C' : '—'}</div></div>
        <div class="rel-stat-box"><div class="lbl">TEMPO DE OPERAÇÃO</div><div class="val">${e.tempo_operacao || '—'}</div></div>
      </div>
      ${palletsHtml}
    </div>`;

    const container = document.getElementById('relatorio-pdf');
    container.innerHTML = html;

    // Aguarda todas as imagens carregarem antes de imprimir
    const imgs = container.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
    ));

    window.onafterprint = async () => {
      window.onafterprint = null;
      try { await api.post(`/resfriamento/sessao/${sessaoId}/limpar-fotos`, {}); } catch (_) {}
    };

    window.print();
  } catch (e) {
    showToast('Erro ao gerar relatório: ' + e.message, 'error');
  }
}

/* ─── init ───────────────────────────────────────────────────── */

document.getElementById('foto-temp-saida').addEventListener('change', async e => {
  const file = e.target.files?.[0];
  if (!file) return;
  await _limparArquivoSaida();
  await uploadFotoSaida(file);
});

document.getElementById('remover-temp-saida').addEventListener('click', e => {
  e.stopPropagation();
  removerFotoSaida();
});

async function init() {
  try {
    dadosTuneis = await api.get('/resfriamento/tuneis');
  } catch (e) {
    showToast('Erro ao carregar túneis: ' + e.message, 'error');
    dadosTuneis = {};
  }
  renderBocas();
  await selectTunel(tunelAtivo);
}

init();
