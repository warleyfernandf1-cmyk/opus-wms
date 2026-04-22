/* ─── camaras.js ─────────────────────────────────────────────────────────────
   Mapa visual das câmaras frias.
   Requisitos implementados:
   - Células do corredor idênticas às das ruas (mesmo tamanho, mesma lógica)
   - Exibe: ID do pallet · Variedade · Classificação
   - Tooltip com dias de permanência (calculado a partir de data_embalamento)
   - Cabeçalhos de rua (eixo superior) e posição (eixo lateral)
   - Gaps (portas) renderizados como espaço vazio sem borda
   ──────────────────────────────────────────────────────────────────────────── */

let _activeCamera = '01';
let _tooltip = null;

// ── Utilitários ───────────────────────────────────────────────────────────────

function diasDesde(dateStr) {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
}

function truncar(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function criarTooltip() {
  const el = document.createElement('div');
  el.id = 'cam-tooltip';
  el.style.cssText = `
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    display: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 10px 14px;
    font-size: .78rem;
    line-height: 1.6;
    min-width: 170px;
    box-shadow: 0 8px 24px rgba(0,0,0,.5);
  `;
  document.body.appendChild(el);
  return el;
}

function showTooltipCell(e, cell) {
  if (!_tooltip) _tooltip = criarTooltip();

  let html = '';
  if (cell.is_gap) {
    html = `<div style="color:var(--muted);font-size:.75rem">⬛ Porta / Gap</div>`;
  } else if (cell.status === 'livre') {
    html = `
      <div style="color:var(--muted);font-size:.7rem;margin-bottom:4px">${cell.id}</div>
      <div style="color:var(--success)">● Livre</div>`;
  } else {
    const p = cell.pallet || {};
    const dias = diasDesde(p.data_embalamento);
    const statusColor = cell.status === 'ocupada' ? 'var(--danger)' : 'var(--warning)';
    const statusLabel = cell.status === 'ocupada' ? 'Ocupada' : 'Reservada';
    html = `
      <div style="color:var(--muted);font-size:.7rem;margin-bottom:6px">${cell.id}</div>
      <div style="font-weight:700;font-size:.92rem;color:var(--text);margin-bottom:2px">
        Pallet #${cell.pallet_id || '—'}
      </div>
      ${p.variedade   ? `<div style="color:var(--muted)">Variedade: <span style="color:var(--text)">${p.variedade}</span></div>` : ''}
      ${p.classificacao ? `<div style="color:var(--muted)">Classe: <span style="color:var(--text)">${p.classificacao}</span></div>` : ''}
      ${p.produtor    ? `<div style="color:var(--muted)">Produtor: <span style="color:var(--text)">${truncar(p.produtor,22)}</span></div>` : ''}
      ${p.qtd_caixas  ? `<div style="color:var(--muted)">Caixas: <span style="color:var(--text)">${p.qtd_caixas}</span></div>` : ''}
      ${dias !== null ? `<div style="margin-top:4px;color:var(--warning);font-weight:600">⏱ ${dias}d de permanência</div>` : ''}
      <div style="margin-top:4px;color:${statusColor};font-size:.72rem;font-weight:600">● ${statusLabel}</div>`;
  }

  _tooltip.innerHTML = html;
  _tooltip.style.display = 'block';
  positionTooltip(e);
}

function positionTooltip(e) {
  if (!_tooltip) return;
  const pad = 12;
  const tw = _tooltip.offsetWidth;
  const th = _tooltip.offsetHeight;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + tw > window.innerWidth  - pad) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - pad) y = e.clientY - th - pad;
  _tooltip.style.left = x + 'px';
  _tooltip.style.top  = y + 'px';
}

function hideTooltip() {
  if (_tooltip) _tooltip.style.display = 'none';
}

// ── Construção da célula ──────────────────────────────────────────────────────

function buildCell(cell) {
  const div = document.createElement('div');

  // Gap (porta): espaço vazio, sem borda
  if (cell.is_gap) {
    div.className = 'pos-cell-v2 gap';
    div.addEventListener('mouseenter', e => showTooltipCell(e, cell));
    div.addEventListener('mousemove',  e => positionTooltip(e));
    div.addEventListener('mouseleave', hideTooltip);
    return div;
  }

  // Classe de status
  let statusClass = 'livre';
  if (cell.status === 'ocupada') statusClass = 'ocupada';
  else if (cell.status && cell.status.startsWith('reservada')) statusClass = 'reservada';

  div.className = `pos-cell-v2 ${statusClass}`;

  // Conteúdo interno — só para células com pallet
  if (cell.pallet_id && cell.pallet) {
    const p = cell.pallet;
    const variedade   = p.variedade    ? truncar(p.variedade, 10)    : '';
    const classific   = p.classificacao ? truncar(p.classificacao, 10) : '';

    div.innerHTML = `
      <span class="pcv2-id">${cell.pallet_id}</span>
      ${variedade  ? `<span class="pcv2-var">(${variedade})</span>` : ''}
      ${classific  ? `<span class="pcv2-cls">${classific}</span>`   : ''}
    `;
  } else if (cell.pallet_id) {
    // Pallet sem dados enriquecidos (fallback)
    div.innerHTML = `<span class="pcv2-id">${cell.pallet_id}</span>`;
  }

  div.addEventListener('mouseenter', e => showTooltipCell(e, cell));
  div.addEventListener('mousemove',  e => positionTooltip(e));
  div.addEventListener('mouseleave', hideTooltip);

  return div;
}

// ── Render principal ──────────────────────────────────────────────────────────

async function renderCamara(id) {
  _activeCamera = id;

  // Botões de aba — estado ativo
  document.querySelectorAll('.btn-camara-tab').forEach(b => {
    b.classList.toggle('active', b.dataset.cam === id);
  });

  document.getElementById('camara-titulo').textContent = `Câmara ${id}`;
  const mapEl = document.getElementById('camara-map');
  mapEl.innerHTML = '<span class="text-muted"><span class="spinner"></span> Carregando...</span>';

  try {
    const data = await api.get(`/camaras/${id}`);
    const posicoes = data.posicoes || [];

    // Separar ruas e corredor; descobrir dimensões dinamicamente
    const ruasMap   = {};   // rua(int) → [posição, ...]
    const corMap    = {};   // posicao(int) → posição

    let maxPosicao  = 0;
    let maxRua      = 0;

    for (const p of posicoes) {
      if (p.tipo === 'corredor') {
        corMap[p.posicao] = p;
      } else {
        ruasMap[p.rua] = ruasMap[p.rua] || {};
        ruasMap[p.rua][p.posicao] = p;
      }
      if (p.posicao > maxPosicao) maxPosicao = p.posicao;
      if (p.tipo === 'rua' && p.rua > maxRua) maxRua = p.rua;
    }

    // ── Container principal ──
    mapEl.innerHTML = '';
    const wrapper = document.createElement('div');
    wrapper.className = 'camv2-wrapper';
    mapEl.appendChild(wrapper);

    // ── Cabeçalho de posições (eixo superior: P01…Pn) ──
    const headerRow = document.createElement('div');
    headerRow.className = 'camv2-row';

    // Espaço do label de rua
    const cornerEl = document.createElement('div');
    cornerEl.className = 'camv2-row-label';
    headerRow.appendChild(cornerEl);

    for (let pos = 1; pos <= maxPosicao; pos++) {
      const lbl = document.createElement('div');
      lbl.className = 'camv2-col-header';
      lbl.textContent = `P${String(pos).padStart(2, '0')}`;
      headerRow.appendChild(lbl);
    }
    wrapper.appendChild(headerRow);

    // ── Função auxiliar: montar uma linha ──
    function buildRow(labelText, labelColor, getCellForPos) {
      const row = document.createElement('div');
      row.className = 'camv2-row';

      const lbl = document.createElement('div');
      lbl.className = 'camv2-row-label';
      lbl.textContent = labelText;
      if (labelColor) lbl.style.color = labelColor;
      row.appendChild(lbl);

      for (let pos = 1; pos <= maxPosicao; pos++) {
        const cell = getCellForPos(pos);
        if (cell) {
          row.appendChild(buildCell(cell));
        } else {
          // Posição não existe nesta rua — placeholder transparente
          const ph = document.createElement('div');
          ph.className = 'pos-cell-v2 placeholder';
          row.appendChild(ph);
        }
      }
      return row;
    }

    // ── Ruas R01 → Rn ──
    for (let r = 1; r <= maxRua; r++) {
      const row = buildRow(
        `R${String(r).padStart(2, '0')}`,
        null,
        pos => ruasMap[r] ? ruasMap[r][pos] : null
      );
      wrapper.appendChild(row);
    }

    // ── Separador visual antes do corredor ──
    const sep = document.createElement('div');
    sep.className = 'camv2-separator';
    wrapper.appendChild(sep);

    // ── Corredor (C0) — linha de células idênticas às ruas ──
    const corRow = buildRow(
      'COR',
      'var(--accent)',
      pos => corMap[pos] || null
    );
    wrapper.appendChild(corRow);

    // ── Footer de estatísticas ──
    const livre   = posicoes.filter(p => !p.is_gap && p.status === 'livre').length;
    const ocupada = posicoes.filter(p => !p.is_gap && p.status === 'ocupada').length;
    const reserv  = posicoes.filter(p => !p.is_gap && p.status && p.status.startsWith('reservada')).length;
    const total   = posicoes.filter(p => !p.is_gap).length;
    const pct     = total > 0 ? Math.round(livre / total * 100) : 0;

    document.getElementById('camara-legenda').innerHTML =
      `Câmara ${id} — <strong style="color:var(--success)">${livre}</strong> livres de
       <strong>${total}</strong> posições
       (<strong style="color:var(--success)">${pct}% disponível</strong>)
       &nbsp;·&nbsp;
       <span style="color:var(--danger)">${ocupada} ocupadas</span>
       &nbsp;·&nbsp;
       <span style="color:var(--warning)">${reserv} reservadas</span>`;

  } catch (e) {
    mapEl.innerHTML = `<span style="color:var(--danger)">Erro ao carregar: ${e.message}</span>`;
  }
}

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
  renderCamara('01');

  // Fechar tooltip ao rolar
  document.addEventListener('scroll', hideTooltip, true);
});
