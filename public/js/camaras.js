/* ─── camaras.js ──────────────────────────────────────────────────────────────
   Estrutura real da API (posicoes_camara):
     { id, camara, tipo, rua, posicao, status, pallet_id, is_gap, pallet? }

   Para ruas:     tipo="rua",      rua=1…13, posicao=1…6
   Para corredor: tipo="corredor", rua=0,    posicao=1…N  (sequencial)
     - posicao 1  = coluna R{maxRua}  (ex: R13)
     - posicao N  = coluna R01
     - gaps Câmara 01: posicao 7 e 8
     - gaps Câmara 02: posicao 12 e 13

   Layout visual (igual à imagem de referência):
   ┌──────┬──R13──┬──R12──┬─ … ─┬──R01──┐
   │  C0  │  [  ] │  [  ] │ … │  [  ] │  ← corredor (1ª linha)
   │  NP  │       │       │   │       │
   ├──────┼───────┼───────┼───┼───────┤
   │  P01 │  [  ] │  [  ] │ … │  [  ] │
   │  …   │  …
   └──────┴───────┴───────┴───┴───────┘
   ──────────────────────────────────────────────────────────────────────────── */

let _tooltip  = null;
let _dragCell = null;   // dados da célula de origem
let _dragEl   = null;   // elemento DOM da célula de origem
let _ghostEl  = null;   // ghost flutuante para touch drag
let _camAtual = '01';   // câmara exibida, para refresh pós-mover

// ── Utilitários ───────────────────────────────────────────────────────────────

function diasDesde(dateStr) {
  if (!dateStr) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000));
}

function trunc(str, max) {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '…' : str;
}

// ── Tooltip ───────────────────────────────────────────────────────────────────

function getTooltip() {
  if (!_tooltip) {
    _tooltip = document.createElement('div');
    _tooltip.id = 'cam-tooltip';
    _tooltip.style.cssText = `
      position:fixed;z-index:9999;pointer-events:none;display:none;
      background:var(--surface);border:1px solid var(--border);
      border-radius:8px;padding:10px 14px;font-size:.78rem;line-height:1.65;
      min-width:175px;max-width:240px;box-shadow:0 8px 24px rgba(0,0,0,.55);
    `;
    document.body.appendChild(_tooltip);
  }
  return _tooltip;
}

function showTooltip(e, cell) {
  if (_dragCell) return; // não mostrar tooltip durante drag
  const tt = getTooltip();
  const p  = cell.pallet || {};
  const dias = diasDesde(p.data_embalamento);
  let html = '';

  if (cell.is_gap) {
    html = `<span style="color:var(--muted);font-size:.75rem">⬛ Porta / Gap</span>`;

  } else if (!cell.pallet_id) {
    html = `
      <div style="color:var(--muted);font-size:.7rem;margin-bottom:3px">${cell.id}</div>
      <div style="color:var(--success);font-size:.8rem">● Livre</div>`;

  } else {
    const isCor    = cell.tipo === 'corredor';
    const corBadge = isCor ? `<span style="font-size:.68rem;color:var(--warning)"> · Corredor</span>` : '';
    const statusCor = cell.status === 'ocupada' ? 'var(--accent)' : 'var(--warning)';
    const statusLbl = cell.status === 'ocupada' ? 'Ocupada'       : 'Reservada';

    html = `
      <div style="color:var(--muted);font-size:.68rem;margin-bottom:5px">${cell.id}${corBadge}</div>
      <div style="font-weight:700;font-size:.9rem;color:var(--text);margin-bottom:3px">
        Pallet #${cell.pallet_id}
      </div>
      ${p.variedade     ? `<div style="color:var(--muted)">Variedade: <b style="color:var(--text)">${p.variedade}</b></div>` : ''}
      ${p.classificacao ? `<div style="color:var(--muted)">Classe: <b style="color:var(--text)">${p.classificacao}</b></div>` : ''}
      ${p.produtor      ? `<div style="color:var(--muted)">Produtor: <b style="color:var(--text)">${trunc(p.produtor, 24)}</b></div>` : ''}
      ${p.qtd_caixas    ? `<div style="color:var(--muted)">Caixas: <b style="color:var(--text)">${p.qtd_caixas}</b></div>` : ''}
      ${p.peso          ? `<div style="color:var(--muted)">Peso: <b style="color:var(--text)">${p.peso} kg</b></div>` : ''}
      ${dias !== null   ? `<div style="margin-top:5px;color:var(--warning);font-weight:600">⏱ ${dias}d de permanência</div>` : ''}
      <div style="margin-top:4px;color:${statusCor};font-size:.72rem;font-weight:600">● ${statusLbl}</div>`;
  }

  tt.innerHTML = html;
  tt.style.display = 'block';
  moveTooltip(e);
}

function moveTooltip(e) {
  const tt = getTooltip();
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  if (x + tt.offsetWidth  > window.innerWidth  - pad) x = e.clientX - tt.offsetWidth  - pad;
  if (y + tt.offsetHeight > window.innerHeight - pad) y = e.clientY - tt.offsetHeight - pad;
  tt.style.left = x + 'px';
  tt.style.top  = y + 'px';
}

function hideTooltip() {
  getTooltip().style.display = 'none';
}

// ── Drag & Drop — helpers ─────────────────────────────────────────────────────

function _criarGhost(palletId) {
  const g = document.createElement('div');
  g.className = 'dnd-ghost';
  g.textContent = `↕ Pallet #${palletId}`;
  document.body.appendChild(g);
  return g;
}

function _moverGhost(x, y) {
  if (_ghostEl) {
    _ghostEl.style.left = x + 'px';
    _ghostEl.style.top  = y + 'px';
  }
}

function _limparGhost() {
  if (_ghostEl) { _ghostEl.remove(); _ghostEl = null; }
}

function _limparDestaques() {
  document.querySelectorAll('.drag-over-valid, .drag-over-blocked')
    .forEach(el => el.classList.remove('drag-over-valid', 'drag-over-blocked'));
}

async function _executarMove(origemId, destinoId) {
  if (!origemId || !destinoId || origemId === destinoId) return;
  try {
    await api.post('/camaras/mover', {
      posicao_origem_id: origemId,
      posicao_destino_id: destinoId,
    });
    showToast('Pallet movido com sucesso', 'success');
    renderCamara(_camAtual);
  } catch (err) {
    showToast('Erro ao mover: ' + err.message, 'error');
  }
}

// Adiciona handlers de "drop bloqueado" (feedback visual sem aceitar drop)
function _bindBlockedDrop(div, ownId) {
  div.addEventListener('dragover', e => {
    if (!_dragCell) return;
    if (ownId && _dragCell.id === ownId) return; // ignorar hover sobre si mesmo
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
    div.classList.add('drag-over-blocked');
  });
  div.addEventListener('dragleave', () => div.classList.remove('drag-over-blocked'));
  div.addEventListener('drop', e => {
    e.preventDefault();
    div.classList.remove('drag-over-blocked');
  });
}

// ── Célula ────────────────────────────────────────────────────────────────────

function buildCell(cell) {
  const div = document.createElement('div');
  div.dataset.cellId = cell.id;

  if (cell.is_gap) {
    div.className = 'pcv2 gap';
    _bindBlockedDrop(div);
    return div;
  }

  const isCor = cell.tipo === 'corredor';
  let sc = 'livre';
  if (cell.status === 'ocupada')                               sc = 'ocupada';
  else if (cell.status && cell.status.startsWith('reservada')) sc = 'reservada';

  div.className = `pcv2${isCor ? ' corredor' : ''} ${sc}`;

  if (cell.pallet_id) {
    // ── Conteúdo ──
    const p  = cell.pallet || {};
    const va = p.variedade     ? trunc(p.variedade, 10)     : '';
    const cl = p.classificacao ? trunc(p.classificacao, 10) : '';
    div.innerHTML =
      `<span class="pcv2-id">${cell.pallet_id}</span>` +
      (va ? `<span class="pcv2-var">(${va})</span>` : '') +
      (cl ? `<span class="pcv2-cls">${cl}</span>`   : '');

    // ── Desktop drag — origem ──
    div.draggable = true;

    div.addEventListener('dragstart', e => {
      _dragCell = cell;
      _dragEl   = div;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', cell.id);
      requestAnimationFrame(() => div.classList.add('dragging'));
    });

    div.addEventListener('dragend', () => {
      div.classList.remove('dragging');
      _limparDestaques();
      _dragCell = null;
      _dragEl   = null;
    });

    // Bloquear drop nesta célula ocupada (exceto a própria)
    _bindBlockedDrop(div, cell.id);

    // ── Touch drag — origem ──
    div.addEventListener('touchstart', e => {
      const t = e.touches[0];
      _dragCell = cell;
      _dragEl   = div;
      _ghostEl  = _criarGhost(cell.pallet_id);
      _moverGhost(t.clientX, t.clientY);
      div.classList.add('dragging');
    }, { passive: true });

    div.addEventListener('touchmove', e => {
      e.preventDefault(); // bloqueia scroll durante drag
      const t = e.touches[0];
      _moverGhost(t.clientX, t.clientY);

      // Identificar célula sob o dedo
      _ghostEl.style.display = 'none';
      const under = document.elementFromPoint(t.clientX, t.clientY);
      _ghostEl.style.display = '';

      _limparDestaques();
      if (under) {
        const target = under.closest('.pcv2');
        if (target && target !== div) {
          const isLivre = target.classList.contains('livre') && !target.classList.contains('gap');
          target.classList.add(isLivre ? 'drag-over-valid' : 'drag-over-blocked');
        }
      }
    }, { passive: false });

    div.addEventListener('touchend', e => {
      const t = e.changedTouches[0];
      if (_ghostEl) _ghostEl.style.display = 'none';
      const under = document.elementFromPoint(t.clientX, t.clientY);
      _limparGhost();
      _limparDestaques();
      div.classList.remove('dragging');

      if (under && _dragCell) {
        const target = under.closest('.pcv2');
        if (
          target && target !== div &&
          target.classList.contains('livre') &&
          !target.classList.contains('gap') &&
          target.dataset.cellId
        ) {
          _executarMove(_dragCell.id, target.dataset.cellId);
        }
      }

      _dragCell = null;
      _dragEl   = null;
    });

  } else if (isCor && cell._ruaLabel) {
    div.innerHTML = `<span class="pcv2-rua-num">${cell._ruaLabel}</span>`;
  }

  // ── Drop zone — células livres ──
  if (sc === 'livre') {
    div.addEventListener('dragover', e => {
      if (!_dragCell) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      div.classList.add('drag-over-valid');
    });
    div.addEventListener('dragleave', () => div.classList.remove('drag-over-valid'));
    div.addEventListener('drop', e => {
      e.preventDefault();
      div.classList.remove('drag-over-valid');
      if (_dragCell) _executarMove(_dragCell.id, cell.id);
    });
  } else if (sc === 'reservada') {
    _bindBlockedDrop(div);
  }

  div.addEventListener('mouseenter', e => showTooltip(e, cell));
  div.addEventListener('mousemove',  moveTooltip);
  div.addEventListener('mouseleave', hideTooltip);
  return div;
}

// ── Render ────────────────────────────────────────────────────────────────────

async function renderCamara(id) {
  _camAtual = id;
  document.querySelectorAll('.btn-camara-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.cam === id));
  document.getElementById('camara-titulo').textContent = `Câmara ${id}`;

  const mapEl = document.getElementById('camara-map');
  mapEl.innerHTML = '<span class="text-muted"><span class="spinner"></span> Carregando…</span>';

  try {
    const data     = await api.get(`/camaras/${id}`);
    const posicoes = data.posicoes || [];

    // ── Indexar ───────────────────────────────────────────────────────────────
    const ruasMap = {};
    const corSeq  = {};
    let maxRua = 0, maxPos = 0, totalCorPosicoes = 0;

    for (const p of posicoes) {
      if (p.tipo === 'corredor') {
        corSeq[p.posicao] = p;
        if (p.posicao > totalCorPosicoes) totalCorPosicoes = p.posicao;
      } else {
        if (!ruasMap[p.rua]) ruasMap[p.rua] = {};
        ruasMap[p.rua][p.posicao] = p;
        if (p.rua     > maxRua) maxRua = p.rua;
        if (p.posicao > maxPos) maxPos = p.posicao;
      }
    }

    const numCols = Math.max(maxRua, totalCorPosicoes);

    // ── Grid CSS ──────────────────────────────────────────────────────────────
    mapEl.innerHTML = '';
    const grid = document.createElement('div');
    grid.className = 'camv2-grid';
    grid.style.gridTemplateColumns = `44px repeat(${numCols}, 1fr)`;
    grid.style.gridTemplateRows = `22px 1fr 7px repeat(${maxPos}, 1fr)`;
    mapEl.appendChild(grid);

    // ── Linha 0: cabeçalhos de rua ────────────────────────────────────────────
    _cell(grid, '');
    for (let c = 0; c < numCols; c++) {
      const rua = numCols - c;
      const lbl = document.createElement('div');
      lbl.className   = 'camv2-col-header';
      lbl.textContent = `R${String(rua).padStart(2, '0')}`;
      grid.appendChild(lbl);
    }

    // ── Linha 1: corredor ─────────────────────────────────────────────────────
    const corAtivos = Object.values(corSeq).filter(c => !c.is_gap).length;
    const corLbl = document.createElement('div');
    corLbl.className = 'camv2-row-label camv2-cor-label';
    corLbl.innerHTML = `<span>C0</span><span class="camv2-cor-sub">${corAtivos}P</span>`;
    grid.appendChild(corLbl);

    for (let c = 0; c < numCols; c++) {
      const corPos = c + 1;
      const rua    = numCols - c;
      const cell   = corSeq[corPos] || null;

      if (cell) {
        cell._ruaLabel = String(rua).padStart(2, '0');
        grid.appendChild(buildCell(cell));
      } else {
        grid.appendChild(_placeholder());
      }
    }

    // ── Linha 2: separador ────────────────────────────────────────────────────
    const sep = document.createElement('div');
    sep.style.cssText =
      `grid-column:1/span ${numCols + 1};` +
      `border-top:1px solid var(--border);margin:0 2px;align-self:center;`;
    grid.appendChild(sep);

    // ── Linhas 3…: P01 … Pn ──────────────────────────────────────────────────
    for (let pos = 1; pos <= maxPos; pos++) {
      const rowLbl = document.createElement('div');
      rowLbl.className   = 'camv2-row-label';
      rowLbl.textContent = `P${String(pos).padStart(2, '0')}`;
      grid.appendChild(rowLbl);

      for (let c = 0; c < numCols; c++) {
        const rua  = numCols - c;
        const cell = ruasMap[rua] ? ruasMap[rua][pos] : null;
        grid.appendChild(cell ? buildCell(cell) : _placeholder());
      }
    }

    // ── Footer ────────────────────────────────────────────────────────────────
    const livre  = posicoes.filter(p => !p.is_gap && p.status === 'livre').length;
    const ocup   = posicoes.filter(p => !p.is_gap && p.status === 'ocupada').length;
    const reserv = posicoes.filter(p => !p.is_gap && p.status && p.status.startsWith('reservada')).length;
    const total  = posicoes.filter(p => !p.is_gap).length;
    const pct    = total > 0 ? Math.round(livre / total * 100) : 0;

    document.getElementById('camara-legenda').innerHTML =
      `Câmara ${id} — <strong style="color:var(--success)">${livre}</strong> livres de ` +
      `<strong>${total}</strong> posições ` +
      `(<strong style="color:var(--success)">${pct}% disponível</strong>) &nbsp;·&nbsp; ` +
      `<span style="color:var(--accent)">${ocup} ocupadas</span> &nbsp;·&nbsp; ` +
      `<span style="color:var(--warning)">${reserv} reservadas</span>`;

  } catch (err) {
    mapEl.innerHTML =
      `<span style="color:var(--danger)">Erro ao carregar: ${err.message}</span>`;
  }
}

// ── Helpers DOM ───────────────────────────────────────────────────────────────

function _cell(parent, text) {
  const d = document.createElement('div');
  d.textContent = text;
  parent.appendChild(d);
  return d;
}

function _placeholder() {
  const d = document.createElement('div');
  d.className = 'pcv2 placeholder';
  return d;
}

// ── Init ──────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  renderCamara('01');
  document.addEventListener('scroll', hideTooltip, true);
});
