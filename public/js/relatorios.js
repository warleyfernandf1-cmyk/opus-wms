/* ─── relatorios.js ─────────────────────────────────────────────────────────── */

let _relAtual = null; // relatório aberto no modal

// ── Helpers ──────────────────────────────────────────────────────────────────

function _modLabel(m) {
  const map = {
    resfriamento: 'Resfriamento',
    recepcao:     'Recepção',
    inventario:   'Inventário',
    expedicao:    'Expedição',
  };
  return map[m] || m;
}

function _duracao(s) {
  if (!s && s !== 0) return '—';
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = Math.floor(s % 60);
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(ss).padStart(2,'0')}`;
}

function _fmtR(iso) {
  if (!iso) return '—';
  try { return new Date(iso).toLocaleString('pt-BR'); } catch (_) { return iso; }
}

// ── Lista ─────────────────────────────────────────────────────────────────────

async function loadRelatorios() {
  const modulo = document.getElementById('filtro-modulo').value;
  const tbody  = document.getElementById('tbody-relatorios');
  tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Carregando…</td></tr>';

  try {
    const list = await api.get('/relatorios/' + (modulo ? `?modulo=${modulo}` : ''));

    if (!list.length) {
      tbody.innerHTML = `
        <tr><td colspan="6" style="padding:24px;text-align:center;color:var(--text-muted)">
          Nenhum relatório encontrado.
        </td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(r => {
      const dados = r.dados || {};
      const sessaoId = dados.sessao?.id || null;
      return `
        <tr>
          <td><span class="badge-status badge-${r.modulo}">${_modLabel(r.modulo)}</span></td>
          <td style="font-weight:600">${r.titulo}</td>
          <td>${fmtDate(r.inicio_execucao)}</td>
          <td>${fmtDate(r.fim_execucao)}</td>
          <td style="color:var(--text-muted)">${_duracao(r.tempo_medio_s)}</td>
          <td>
            <div style="display:flex;gap:6px">
              <button class="btn btn-ghost btn-sm"
                onclick='abrirModal(${JSON.stringify(r)})'>Ver</button>
              ${sessaoId
                ? `<button class="btn btn-ghost btn-sm"
                    onclick='abrirModal(${JSON.stringify(r)}, true)'>🖨 Imprimir</button>`
                : ''}
            </div>
          </td>
        </tr>`;
    }).join('');

  } catch (e) {
    showToast(e.message, 'error');
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--danger)">Erro: ${e.message}</td></tr>`;
  }
}

// ── Modal ─────────────────────────────────────────────────────────────────────

function abrirModal(r, autoImprimir = false) {
  _relAtual = r;

  const dados    = r.dados || {};
  const sessao   = dados.sessao || {};
  const pallets  = dados.pallets || [];
  const e        = dados.estatisticas || {};
  const sessaoId = sessao.id || null;

  document.getElementById('modal-titulo').textContent = r.titulo;

  const btnImprimir = document.getElementById('btn-modal-imprimir');
  if (sessaoId) {
    btnImprimir.style.display = '';
  } else {
    btnImprimir.style.display = 'none';
  }

  const palletsHtml = pallets.length
    ? `<table class="pallet-table">
        <thead>
          <tr>
            <th>Pallet</th>
            <th>Variedade</th>
            <th>Classe</th>
            <th class="num">Caixas</th>
            <th class="num">T. Entrada</th>
            <th class="num">T. Saída</th>
            <th>Boca</th>
          </tr>
        </thead>
        <tbody>
          ${pallets.map(p => `
            <tr>
              <td style="font-weight:600">${p.id}</td>
              <td>${p.variedade || '—'}</td>
              <td>${p.classificacao || '—'}</td>
              <td class="num">${p.qtd_caixas ?? '—'}</td>
              <td class="num">${p.temp_entrada != null ? p.temp_entrada + ' °C' : '—'}</td>
              <td class="num">${p.temp_saida   != null ? p.temp_saida   + ' °C' : '—'}</td>
              <td>${p.boca ? 'Boca ' + p.boca : '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
    : `<p style="color:var(--text-muted);font-size:.85rem">Nenhum pallet registrado nesta sessão.</p>`;

  document.getElementById('modal-body').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:16px">
      <div>
        <div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px">Módulo</div>
        <div style="font-weight:600">${_modLabel(r.modulo)}</div>
      </div>
      <div>
        <div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px">Túnel</div>
        <div style="font-weight:600">Túnel ${sessao.tunel || '—'}</div>
      </div>
      <div>
        <div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px">Início</div>
        <div>${fmtDate(r.inicio_execucao)}</div>
      </div>
      <div>
        <div style="font-size:.62rem;text-transform:uppercase;color:var(--text-muted);margin-bottom:2px">Encerramento</div>
        <div>${fmtDate(r.fim_execucao)}</div>
      </div>
    </div>

    <div class="stat-mini-grid">
      <div class="stat-mini-box">
        <div class="lbl">Pallets</div>
        <div class="val">${e.total_pallets ?? '—'}</div>
      </div>
      <div class="stat-mini-box">
        <div class="lbl">Temp. média entrada</div>
        <div class="val">${e.temp_media_entrada != null ? e.temp_media_entrada + ' °C' : '—'}</div>
      </div>
      <div class="stat-mini-box">
        <div class="lbl">Temp. média saída</div>
        <div class="val">${e.temp_media_saida != null ? e.temp_media_saida + ' °C' : '—'}</div>
      </div>
    </div>

    ${palletsHtml}
  `;

  document.getElementById('modal-overlay').classList.add('open');

  if (autoImprimir) {
    // pequeno delay para o modal aparecer antes do print
    setTimeout(() => imprimirAtual(), 300);
  }
}

function fecharModal() {
  document.getElementById('modal-overlay').classList.remove('open');
  _relAtual = null;
}

function fecharModalSe(e) {
  if (e.target === document.getElementById('modal-overlay')) fecharModal();
}

// ── Impressão ─────────────────────────────────────────────────────────────────

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

function _fotoCol(label, url, ts, op) {
  const cap = [ts ? _fmtR(ts) : null, op || null].filter(Boolean).join(' · ') || '—';
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

function _buildPrintHtml(data, titulo) {
  const { sessao, pallets, estatisticas } = data;
  const e = estatisticas;
  const opRecepcao     = pallets.find(p => p.operador_recepcao)?.operador_recepcao || '—';
  const opResfriamento = pallets.find(p => p.operador_saida)?.operador_saida        || '—';

  const palletsHtml = pallets.map(p => `
    <div class="rel-pallet">
      <div class="rel-pallet-hdr">
        <div class="rel-pallet-id">PALLET ${p.id}</div>
        <div class="rel-pallet-desc">
          ${p.variedade || '—'} · ${p.classificacao || '—'} · ${p.qtd_caixas != null ? p.qtd_caixas + ' cx' : '—'}
        </div>
        <div class="rel-pallet-ops">
          <div><div class="lbl">ENTRADA</div><div class="val">${_fmtR(p.ts_recepcao)}</div></div>
          <div><div class="lbl">SAÍDA</div><div class="val">${_fmtR(p.ts_saida)}</div></div>
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
        ${_fotoCol('TEMP. ENTRADA',     p.foto_temp_entrada,   p.ts_recepcao, p.operador_recepcao)}
        ${_fotoCol('ESPELHO DO PALLET', p.foto_espelho,        p.ts_recepcao, p.operador_recepcao)}
        ${_fotoCol('FOTO DO PALLET',    p.foto_pallet_entrada, p.ts_recepcao, p.operador_recepcao)}
        ${_fotoCol('TEMP. SAÍDA',       p.foto_temp_saida,     p.ts_saida,    p.operador_saida)}
      </div>
    </div>
  `).join('');

  return `<div class="rel-doc">
    <div class="rel-session-hdr">
      <div class="rel-logo-wrap">
        ${_LOGO_SVG}
        <div class="rel-logo-text">
          <div class="t1">Relatório de Recepção / Resfriamento</div>
          <div class="t2">${titulo}</div>
        </div>
      </div>
      <div class="rel-session-meta">
        <div><div class="lbl">DATA/HORA DE ENTRADA</div><div class="val">${_fmtR(sessao.iniciado_em)}</div></div>
        <div><div class="lbl">DATA/HORA DE SAÍDA</div><div class="val">${_fmtR(sessao.finalizado_em)}</div></div>
        <div><div class="lbl">OPERADOR RECEPÇÃO</div><div class="val">${opRecepcao}</div></div>
        <div><div class="lbl">OPERADOR RESFRIAMENTO</div><div class="val">${opResfriamento}</div></div>
      </div>
    </div>
    <div class="rel-stats">
      <div class="rel-stat-box"><div class="lbl">TÚNEL</div><div class="val">TÚNEL ${sessao.tunel}</div></div>
      <div class="rel-stat-box"><div class="lbl">SESSÃO</div><div class="val">${titulo}</div></div>
      <div class="rel-stat-box"><div class="lbl">PALLETS</div><div class="val">${e.total_pallets}</div></div>
      <div class="rel-stat-box"><div class="lbl">TEMP. MÉDIA ENTRADA</div><div class="val">${e.temp_media_entrada != null ? e.temp_media_entrada + ' °C' : '—'}</div></div>
      <div class="rel-stat-box"><div class="lbl">TEMP. MÉDIA SAÍDA</div><div class="val">${e.temp_media_saida != null ? e.temp_media_saida + ' °C' : '—'}</div></div>
      <div class="rel-stat-box"><div class="lbl">TEMPO DE OPERAÇÃO</div><div class="val">${e.tempo_operacao || '—'}</div></div>
    </div>
    ${palletsHtml}
  </div>`;
}

async function imprimirAtual() {
  if (!_relAtual) return;
  fecharModal();

  const dados    = _relAtual.dados || {};
  const sessaoId = dados.sessao?.id;
  const titulo   = dados.titulo || _relAtual.titulo;

  try {
    showToast('Preparando impressão…', 'info');

    // Tenta buscar dados frescos para garantir foto URLs atuais
    let data = dados;
    if (sessaoId) {
      try {
        data = await api.get(`/resfriamento/sessao/${sessaoId}/relatorio`);
      } catch (_) {}
    }

    const container = document.getElementById('relatorio-pdf');
    container.innerHTML = _buildPrintHtml(data, titulo);

    const imgs = container.querySelectorAll('img');
    await Promise.all(Array.from(imgs).map(img =>
      img.complete ? Promise.resolve() : new Promise(res => { img.onload = res; img.onerror = res; })
    ));

    window.print();
  } catch (e) {
    showToast('Erro ao imprimir: ' + e.message, 'error');
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.getElementById('btn-refresh').addEventListener('click', loadRelatorios);
document.getElementById('filtro-modulo').addEventListener('change', loadRelatorios);
loadRelatorios();
