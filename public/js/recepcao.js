// ─────────────────────────────────────────────────────────
//  MAPEAMENTO DE COLUNAS DA PLANILHA
// ─────────────────────────────────────────────────────────
const COLUMN_ALIASES = {
  nro_pallet:       ['número', 'numero', 'nº', 'n°', 'nro', 'pallet', 'nº do pallet', 'numero pallet'],
  qtd_caixas:       ['qtde. caixas', 'qtde caixas', 'qtd caixas', 'quantidade de caixas', 'caixas'],
  data_embalamento: ['data de embalamento', 'data embalamento', 'data embalagem', 'data embal.', 'data embal', 'data emb.', 'data emb', 'embalamento'],
  variedade:        ['variedade'],
  classificacao:    ['classificação', 'classificacao'],
  safra:            ['safra'],
  etiqueta:         ['etiqueta', 'rótulo', 'rotulo'],
  apelido_talhao:   ['apelido talhão', 'apelido talhao', 'talhão', 'talhao', 'área', 'area'],
  controle:         ['controle'],
  embalagem_raw:    ['embalagem'],
  produtor_raw:     ['produtor'],
  caixa_raw:        ['caixa'],
  peso_raw:         ['peso']
};

const REQUIRED_COLUMNS = [
  'nro_pallet', 'qtd_caixas', 'data_embalamento', 'variedade',
  'classificacao', 'safra', 'etiqueta', 'apelido_talhao', 'controle'
];

let importedRows = [];
let importedFileName = '';
let selectedImportedRowIndex = null;

// ─────────────────────────────────────────────────────────
//  ÁREA / CONTROLE — LISTA DINÂMICA
// ─────────────────────────────────────────────────────────
let acCounter = 0;

function getQtdCaixasTotal() {
  return Number(document.querySelector('[name="qtd_caixas"]')?.value) || 0;
}

function calcDistribuicao() {
  const rows = document.querySelectorAll('.ac-row');
  return Array.from(rows).reduce((sum, row) => {
    return sum + (Number(row.querySelector('[data-field="qtd_caixas"]').value) || 0);
  }, 0);
}

function updateDistStatus() {
  const statusEl = document.getElementById('dist-status');
  const total = getQtdCaixasTotal();
  const dist  = calcDistribuicao();
  const rows  = document.querySelectorAll('.ac-row').length;

  if (!total || !rows) { statusEl.className = 'dist-status'; statusEl.textContent = ''; return; }

  if (dist === total) {
    statusEl.className = 'dist-status ok';
    statusEl.textContent = `✔ Distribuição correta: ${dist} / ${total} caixas alocadas.`;
  } else if (dist > total) {
    statusEl.className = 'dist-status warn';
    statusEl.textContent = `✖ Excesso de ${dist - total} caixas — distribua apenas ${total}.`;
  } else {
    statusEl.className = 'dist-status info';
    statusEl.textContent = `⚠ Faltam ${total - dist} caixas para completar a distribuição.`;
  }
}

function addAreaControle(areaVal = '', controleVal = '', qtdVal = '') {
  const list = document.getElementById('ac-list');
  const id   = ++acCounter;

  const row = document.createElement('div');
  row.className = 'ac-row';
  row.dataset.id = id;
  row.innerHTML = `
    <div class="field">
      <label>Área</label>
      <input type="text" data-field="area" placeholder="Ex: T-01" value="${escapeHtml(areaVal)}" required>
    </div>
    <div class="field">
      <label>Controle</label>
      <input type="text" data-field="controle" placeholder="Ex: CTRL-01" value="${escapeHtml(controleVal)}" required>
    </div>
    <div class="field">
      <label>Qtde cx p/controle</label>
      <input type="number" data-field="qtd_caixas" placeholder="0" min="1" value="${qtdVal}" required>
    </div>
    <div class="field ac-remove-wrap">
      <label>&nbsp;</label>
      <button type="button" class="ac-remove" title="Remover">✕</button>
    </div>
  `;

  row.querySelector('.ac-remove').addEventListener('click', () => {
    row.remove();
    updateRemoveButtons();
    updateDistStatus();
  });

  row.querySelectorAll('input').forEach(inp =>
    inp.addEventListener('input', updateDistStatus)
  );

  list.appendChild(row);
  updateRemoveButtons();
  updateDistStatus();
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll('.ac-row');
  rows.forEach(row => {
    const wrap = row.querySelector('.ac-remove-wrap');
    if (wrap) wrap.style.display = rows.length === 1 ? 'none' : '';
  });
}

function collectAreasControles() {
  return Array.from(document.querySelectorAll('.ac-row')).map(row => ({
    area:       row.querySelector('[data-field="area"]').value.trim(),
    controle:   row.querySelector('[data-field="controle"]').value.trim(),
    qtd_caixas: Number(row.querySelector('[data-field="qtd_caixas"]').value),
  }));
}

function clearAreasControles() {
  document.getElementById('ac-list').innerHTML = '';
  acCounter = 0;
  addAreaControle();
}

// ─────────────────────────────────────────────────────────
//  UTILITÁRIOS
// ─────────────────────────────────────────────────────────
function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}
function asText(value) { return String(value ?? '').trim(); }
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function findColumnKey(headersMap, aliases) {
  for (const alias of aliases) {
    const normalized = normalizeHeader(alias);
    if (headersMap[normalized] !== undefined) return headersMap[normalized];
  }
  return null;
}
function findHeaderRowIndex(rows) {
  return rows.findIndex(row => {
    const cells = row.map(c => normalizeHeader(c)).filter(Boolean);
    return cells.some(c => c === 'numero' || c.includes('numero') || c === 'número')
      && cells.some(c => c.includes('caixas'))
      && cells.some(c => c.includes('data embal'))
      && cells.some(c => c.includes('variedade'));
  });
}
function isAuxiliaryRowAfterHeader(row) {
  const cells = row.map(c => normalizeHeader(c)).filter(Boolean);
  if (!cells.length) return true;
  const joined = cells.join(' | ');
  return joined.includes('tipo : pallet') || joined.includes('tipo: pallet')
    || joined === '-' || cells.every(c => c === '-');
}
function isSummaryRow(row, col) {
  const pallet = readPalletNumber(row, col.nro_pallet, col.qtd_caixas);
  const caixas = parseNumber(row[col.qtd_caixas]);
  const data   = excelDateToISO(row[col.data_embalamento]);
  const variedade = asText(row[col.variedade]);
  const classificacao = asText(row[col.classificacao]);
  if (!pallet && !caixas && !data && !variedade) return true;
  if (pallet && caixas && !data && !variedade && !classificacao) return true;
  if (caixas && !pallet && !data && !variedade) return true;
  return false;
}
function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const match = asText(value).match(/(\d+[.,]?\d*)/);
  return match ? Number(match[1].replace(',', '.')) : null;
}
function excelDateToISO(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
    const p = XLSX.SSF.parse_date_code(value);
    if (p?.y && p?.m && p?.d)
      return `${String(p.y).padStart(4,'0')}-${String(p.m).padStart(2,'0')}-${String(p.d).padStart(2,'0')}`;
  }
  const raw = asText(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const m = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (m) {
    const p1 = Number(m[1]), p2 = Number(m[2]);
    const year = m[3].length === 2 ? `20${m[3]}` : m[3];
    const [month, day] = (p1 <= 12 && p2 > 12) ? [p1, p2] : (p1 > 12 ? [p2, p1] : [p1, p2]);
    return `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  }
  return '';
}
function formatIsoDateToBR(value) {
  if (!value) return '—';
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value;
}
function normalizeEmbalagem(value) {
  const text = normalizeHeader(value).toUpperCase();
  if (!text) return '';
  if (text.includes('FECHADA')) return 'CUMBUCA FECHADA';
  if (text.includes('OPEN TOP') || text.includes('OPEN')) return 'CUMBUCA ABERTA';
  if (text.includes('SACOLA')) return 'SACOLA';
  return asText(value);
}
function normalizeProdutor(value) {
  const words = asText(value).match(/[A-Za-zÀ-ÖØ-öø-ÿ]+/g) || [];
  if (!words.length) return '';
  return words.length === 1 ? words[0] : `${words[0]} ${words[words.length - 1]}`;
}
function normalizeCaixa(value) {
  const raw = asText(value);
  if (!raw) return '';
  const match = raw.match(/(?:\bCX\b|\bCAIXA\b)\s*[:\-]?\s*([A-Z0-9./-]+)/i);
  return match ? match[1].trim() : raw;
}
function normalizePeso(value, fallbackText = '') {
  const raw = asText(value) || asText(fallbackText);
  if (!raw) return parseNumber(value);
  const match = raw.match(/(\d+[.,]?\d*)\s*KG\b/i);
  return match ? Number(match[1].replace(',', '.')) : parseNumber(raw);
}
function normalizeMercado(classificacao) {
  return normalizeHeader(classificacao).includes('exportacao') ? 'EXTERNO' : 'INTERNO';
}
function readPalletNumber(row, palletColIndex, caixasColIndex) {
  const direct = asText(row[palletColIndex]);
  if (direct) return direct;
  const nextCell = asText(row[palletColIndex + 1]);
  const caixasValue = parseNumber(row[caixasColIndex]);
  if (nextCell && /^\d+$/.test(nextCell) && Number(nextCell) !== caixasValue) return nextCell;
  return '';
}

// ─────────────────────────────────────────────────────────
//  VALIDAÇÃO DE LINHA IMPORTADA
// ─────────────────────────────────────────────────────────
function validateImportedRow(row) {
  const required = [
    'nro_pallet','qtd_caixas','data_embalamento','variedade','classificacao',
    'safra','embalagem','rotulo','produtor','caixa','peso','mercado'
  ];
  const missing = required.filter(f => row[f] === '' || row[f] === null || row[f] === undefined);
  if (!row.areas_controles?.length) missing.push('areas_controles');
  row._missing = missing;
  row._valid   = missing.length === 0;
}

// ─────────────────────────────────────────────────────────
//  INFO DE SELEÇÃO
// ─────────────────────────────────────────────────────────
function updateSelectedInfo() {
  const label = document.getElementById('selected-import-info');
  if (selectedImportedRowIndex === null || !importedRows[selectedImportedRowIndex]) {
    label.textContent = 'Nenhuma linha da planilha selecionada.'; return;
  }
  const row = importedRows[selectedImportedRowIndex];
  label.textContent = row._saved
    ? `Linha ${selectedImportedRowIndex + 1} já importada.`
    : `Linha ${selectedImportedRowIndex + 1} selecionada para entrada manual.`;
}

// ─────────────────────────────────────────────────────────
//  PREVIEW DA IMPORTAÇÃO
// ─────────────────────────────────────────────────────────
function renderImportPreview() {
  const wrap    = document.getElementById('import-preview-wrap');
  const tbody   = document.getElementById('tbody-import-preview');
  const summary = document.getElementById('import-summary');

  if (!importedRows.length) {
    wrap.style.display = 'none';
    summary.textContent = importedFileName
      ? `Nenhuma linha válida encontrada em "${importedFileName}".`
      : 'Nenhuma planilha carregada.';
    updateSelectedInfo(); return;
  }

  const valid = importedRows.filter(r => r._valid).length;
  summary.textContent = `"${importedFileName}" — ${importedRows.length} linha(s), ${valid} válida(s).`;
  wrap.style.display = '';

  tbody.innerHTML = importedRows.map((row, i) => {
    const isSelected = selectedImportedRowIndex === i;
    const rowStyle   = isSelected ? 'background:rgba(99,102,241,.15)' : (row._saved ? 'opacity:.5' : '');
    const statusHtml = row._saved
      ? '<span class="badge-status badge-success">Salvo</span>'
      : row._valid
        ? '<span class="badge-status badge-recepcao">OK</span>'
        : `<span class="badge-status badge-danger" title="${row._missing.join(', ')}">Inválido</span>`;
    return `<tr style="${rowStyle}">
      <td>${i + 1}</td>
      <td>${statusHtml}</td>
      <td>${escapeHtml(row.nro_pallet)}</td>
      <td>${row.qtd_caixas ?? '—'}</td>
      <td>${formatIsoDateToBR(row.data_embalamento)}</td>
      <td>${escapeHtml(row.variedade)}</td>
      <td>${escapeHtml(row.classificacao)}</td>
      <td>${escapeHtml(row.embalagem)}</td>
      <td>${escapeHtml(row.produtor)}</td>
      <td>${escapeHtml(row.caixa)}</td>
      <td>${row.peso ?? '—'}</td>
      <td>${(row.areas_controles||[]).map(ac=>escapeHtml(ac.area)).join(', ')}</td>
      <td>${(row.areas_controles||[]).map(ac=>escapeHtml(ac.controle)).join(', ')}</td>
      <td>${(!row._saved && row._valid)
        ? `<button class="btn btn-ghost btn-sm btn-usar-import" data-row="${i}">Usar</button>`
        : '—'}</td>
    </tr>`;
  }).join('');

  updateSelectedInfo();
}

// ─────────────────────────────────────────────────────────
//  PREENCHER FORM A PARTIR DA IMPORTAÇÃO
// ─────────────────────────────────────────────────────────
function setSelectValue(name, value) {
  const el = document.querySelector(`[name="${name}"]`);
  if (!el) return;
  // Tenta match exato, depois case-insensitive
  const options = Array.from(el.options);
  const match = options.find(o => o.value === String(value))
    || options.find(o => o.value.toUpperCase() === String(value).toUpperCase());
  if (match) el.value = match.value;
}

function fillFormFromImportedRow(row) {
  const form = document.getElementById('form-recepcao');

  const textFields = ['nro_pallet','qtd_caixas','data_embalamento','safra','rotulo','produtor','temp_entrada'];
  textFields.forEach(key => { const f = form.elements.namedItem(key); if (f) f.value = row[key] ?? ''; });

  // Variedade: se mix (contém ' | '), tenta o primeiro valor no <select>;
  // o valor completo concatenado fica visível no badge de mix abaixo do campo.
  const variedadeEl = document.querySelector('[name="variedade"]');
  if (variedadeEl) {
    const variedades = (row.variedade || '').split(' | ').map(v => v.trim()).filter(Boolean);
    const oldBadge = document.getElementById('variedade-mix-badge');
    if (oldBadge) oldBadge.remove();
    if (variedades.length > 1) {
      const options = Array.from(variedadeEl.options);
      const match = options.find(o => o.value === variedades[0])
        || options.find(o => o.value.toUpperCase() === variedades[0].toUpperCase());
      variedadeEl.value = match ? match.value : '';
      const badge = document.createElement('span');
      badge.id = 'variedade-mix-badge';
      badge.style.cssText = 'display:inline-block;margin-top:4px;padding:2px 8px;background:var(--warning);color:#000;border-radius:4px;font-size:.75rem;font-weight:600;letter-spacing:.02em;';
      badge.title = 'Mix de variedades — valor completo registrado no pallet';
      badge.textContent = row.variedade;
      variedadeEl.parentElement.appendChild(badge);
    } else {
      setSelectValue('variedade', row.variedade ?? '');
    }
  }
  ['classificacao','embalagem','caixa','mercado'].forEach(key => setSelectValue(key, row[key] ?? ''));
  if (row.peso) setSelectValue('peso', row.peso);

  // Popula exatamente N linhas de área/controle conforme o array (sem linha em branco extra)
  document.getElementById('ac-list').innerHTML = '';
  acCounter = 0;
  (row.areas_controles || [{ area: row.area, controle: row.controle, qtd_caixas: row.qtd_caixas }])
    .forEach(ac => addAreaControle(ac.area || '', ac.controle || '', ac.qtd_caixas || ''));
  updateDistStatus();
}

// ─────────────────────────────────────────────────────────
//  LIMPAR ESTADO DA IMPORTAÇÃO
// ─────────────────────────────────────────────────────────
function clearImportState() {
  importedRows = []; importedFileName = ''; selectedImportedRowIndex = null;
  document.getElementById('file-planilha').value = '';
  document.getElementById('import-errors').textContent = '';
  renderImportPreview();
}

// ─────────────────────────────────────────────────────────
//  PARSING DA PLANILHA
// ─────────────────────────────────────────────────────────
function parseWorksheetRows(rows) {
  if (!rows.length) throw new Error('A planilha está vazia.');
  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex === -1) throw new Error('Cabeçalho da planilha não encontrado.');

  const headers = rows[headerRowIndex].map(c => asText(c));
  const headersMap = {};
  headers.forEach((h, i) => { headersMap[normalizeHeader(h)] = i; });

  const missingColumns = REQUIRED_COLUMNS.filter(key =>
    !COLUMN_ALIASES[key] || findColumnKey(headersMap, COLUMN_ALIASES[key]) === null
  );
  if (missingColumns.length) throw new Error(`Colunas obrigatórias não encontradas: ${missingColumns.join(', ')}`);

  const col = {};
  Object.entries(COLUMN_ALIASES).forEach(([key, aliases]) => { col[key] = findColumnKey(headersMap, aliases); });

  // 1. Parse linha a linha
  const rawRows = rows
    .slice(headerRowIndex + 1)
    .filter(row => !isAuxiliaryRowAfterHeader(row))
    .filter(row => row.some(c => asText(c) !== ''))
    .filter(row => !isSummaryRow(row, col))
    .map(row => {
      const classificacao = asText(row[col.classificacao]);
      const caixaRaw = col.caixa_raw !== null ? row[col.caixa_raw] : '';
      const pesoRaw  = col.peso_raw  !== null ? row[col.peso_raw]  : '';
      return {
        nro_pallet:       readPalletNumber(row, col.nro_pallet, col.qtd_caixas),
        qtd_caixas:       parseNumber(row[col.qtd_caixas]),
        data_embalamento: excelDateToISO(row[col.data_embalamento]),
        variedade:        asText(row[col.variedade]),
        classificacao,
        safra:            asText(row[col.safra]),
        embalagem:        normalizeEmbalagem(col.embalagem_raw !== null ? row[col.embalagem_raw] : ''),
        rotulo:           asText(row[col.etiqueta]),
        produtor:         normalizeProdutor(col.produtor_raw !== null ? row[col.produtor_raw] : ''),
        caixa:            normalizeCaixa(caixaRaw),
        peso:             normalizePeso(pesoRaw, caixaRaw),
        area:             asText(row[col.apelido_talhao]),
        controle:         asText(row[col.controle]),
        mercado:          normalizeMercado(classificacao),
      };
    })
    .filter(row => row.nro_pallet && row.qtd_caixas && row.data_embalamento);

  // 2. Agrupar linhas consecutivas com o mesmo nro_pallet (pallet multi-talhão)
  const grouped = [];
  for (const row of rawRows) {
    const prev = grouped[grouped.length - 1];
    if (prev && prev.nro_pallet === row.nro_pallet) {
      // Mesma linha de pallet — adiciona área/controle e soma caixas
      prev.areas_controles.push({ area: row.area, controle: row.controle, qtd_caixas: row.qtd_caixas });
      prev.qtd_caixas += row.qtd_caixas;
      // Acumula variedades distintas
      if (row.variedade && !prev._variedades.includes(row.variedade)) {
        prev._variedades.push(row.variedade);
        prev.variedade = prev._variedades.join(' | ');
      }
    } else {
      grouped.push({
        ...row,
        _saved: false,
        _variedades: [row.variedade].filter(Boolean),
        areas_controles: [{ area: row.area, controle: row.controle, qtd_caixas: row.qtd_caixas }],
      });
    }
  }

  importedRows = grouped.map(row => { validateImportedRow(row); return row; });

  selectedImportedRowIndex = null;
  renderImportPreview();
}

async function handlePlanilha(file) {
  if (!file) return;
  if (!window.XLSX) throw new Error('Biblioteca de leitura de planilha não carregada.');
  importedFileName = file.name;
  document.getElementById('import-errors').textContent = '';

  const reader = new FileReader();
  reader.onload = event => {
    try {
      const workbook = XLSX.read(event.target.result, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      parseWorksheetRows(XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' }));
      showToast(`Planilha ${file.name} carregada com sucesso.`, 'success');
    } catch (error) {
      importedRows = []; selectedImportedRowIndex = null;
      renderImportPreview();
      document.getElementById('import-errors').textContent = error.message;
      showToast(`Erro ao processar planilha: ${error.message}`, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

// ─────────────────────────────────────────────────────────
//  REGISTRO FOTOGRÁFICO — ENTRADA
// ─────────────────────────────────────────────────────────
const fotoUrls = { temp_entrada: null, espelho: null, pallet_entrada: null };

async function uploadFoto(file, tipo, key, previewId, statusId) {
  const statusEl = document.getElementById(statusId);
  const previewEl = document.getElementById(previewId);
  statusEl.className = 'foto-status uploading';
  statusEl.textContent = '⏳ Enviando…';

  const localUrl = URL.createObjectURL(file);
  previewEl.src = localUrl;
  previewEl.classList.add('visible');

  try {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('tipo', tipo);
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
    fotoUrls[key] = data.url;
    statusEl.className = 'foto-status ok';
    statusEl.textContent = '✔ Foto enviada';
  } catch (e) {
    fotoUrls[key] = null;
    statusEl.className = 'foto-status erro';
    statusEl.textContent = '✖ Falha: ' + e.message;
  }
}

function bindFotoInput(inputId, tipo, key, previewId, statusId) {
  document.getElementById(inputId).addEventListener('change', async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    await uploadFoto(file, tipo, key, previewId, statusId);
  });
}

function clearFotos() {
  fotoUrls.temp_entrada = null;
  fotoUrls.espelho = null;
  fotoUrls.pallet_entrada = null;
  ['temp-entrada', 'espelho', 'pallet-entrada'].forEach(k => {
    const preview = document.getElementById(`preview-${k}`);
    const status  = document.getElementById(`status-${k}`);
    if (preview) { preview.src = ''; preview.classList.remove('visible'); }
    if (status)  { status.className = 'foto-status'; status.textContent = ''; }
  });
  document.getElementById('foto-temp-entrada').value = '';
  document.getElementById('foto-espelho').value = '';
  document.getElementById('foto-pallet-entrada').value = '';
}

// ─────────────────────────────────────────────────────────
//  LISTAGEM DE PALLETS
// ─────────────────────────────────────────────────────────
async function loadPallets() {
  try {
    const pallets = await api.get('/recepcao/');
    const tbody = document.getElementById('tbody-recepcao');
    if (!pallets.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-muted">Nenhum pallet em recepção.</td></tr>'; return;
    }
    tbody.innerHTML = pallets.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.id)}</strong>${p.is_adicao ? ' <span class="badge-status badge-warning" style="font-size:.65rem">ADIÇÃO</span>' : ''}</td>
        <td>${p.qtd_caixas}</td>
        <td>${escapeHtml(p.variedade)}</td>
        <td>${escapeHtml(p.classificacao)}</td>
        <td>T${escapeHtml(p.tunel)}</td>
        <td>${p.boca}</td>
        <td>${p.temp_entrada}°C</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" title="Editar" onclick="abrirEditar('${encodeURIComponent(p.id)}')">✏️</button>
            <button class="btn btn-danger btn-sm" title="Excluir (Rollback)" onclick="rollback('${encodeURIComponent(p.id)}')">🗑️</button>
          </div>
        </td>
      </tr>`).join('');
  } catch (e) {
    showToast('Erro ao carregar pallets: ' + e.message, 'error');
  }
}

async function rollback(encodedId) {
  const id = decodeURIComponent(encodedId);
  if (!confirm(`Excluir permanentemente o pallet ${id}?`)) return;
  try {
    await api.delete(`/recepcao/${encodeURIComponent(id)}/rollback`);
    showToast(`Pallet ${id} excluído.`, 'success');
    loadPallets();
  } catch (e) { showToast(e.message, 'error'); }
}

// ─────────────────────────────────────────────────────────
//  SUBMIT DO FORMULÁRIO
// ─────────────────────────────────────────────────────────
document.getElementById('btn-registrar').addEventListener('click', async () => {
  const form = document.getElementById('form-recepcao');
  const fd   = new FormData(form);
  const body = Object.fromEntries(fd.entries());

  body.qtd_caixas   = Number(body.qtd_caixas);
  body.peso         = Number(body.peso);
  body.temp_entrada = Number(body.temp_entrada);
  body.boca         = Number(body.boca);

  // Coleta e valida areas_controles
  const areasControles = collectAreasControles();

  if (!areasControles.length) {
    showToast('Adicione ao menos uma Área/Controle.', 'error'); return;
  }
  const hasEmpty = areasControles.some(ac => !ac.area || !ac.controle || !ac.qtd_caixas);
  if (hasEmpty) {
    showToast('Preencha todos os campos de Área, Controle e Qtd Caixas.', 'error'); return;
  }

  const totalDist = areasControles.reduce((s, ac) => s + ac.qtd_caixas, 0);
  if (totalDist !== body.qtd_caixas) {
    showToast(`A soma das caixas por área (${totalDist}) deve ser igual ao total (${body.qtd_caixas}).`, 'error'); return;
  }

  body.areas_controles = areasControles;

  if (fotoUrls.temp_entrada)    body.foto_temp_entrada   = fotoUrls.temp_entrada;
  if (fotoUrls.espelho)         body.foto_espelho         = fotoUrls.espelho;
  if (fotoUrls.pallet_entrada)  body.foto_pallet_entrada  = fotoUrls.pallet_entrada;

  try {
    const created = await api.post('/recepcao/', body);
    showToast(`Pallet ${created.id} registrado!${created.is_adicao ? ' (ADIÇÃO)' : ''}`, 'success');

    if (selectedImportedRowIndex !== null && importedRows[selectedImportedRowIndex]) {
      importedRows[selectedImportedRowIndex]._saved = true;
      renderImportPreview();
    }

    form.reset();
    clearAreasControles();
    clearFotos();
    selectedImportedRowIndex = null;
    updateSelectedInfo();
    loadPallets();
  } catch (e) { showToast(e.message, 'error'); }
});

// ─────────────────────────────────────────────────────────
//  EVENTOS GERAIS
// ─────────────────────────────────────────────────────────
document.getElementById('btn-refresh').addEventListener('click', loadPallets);

document.getElementById('btn-add-ac').addEventListener('click', () => addAreaControle());

// Atualiza status ao mudar qtd_caixas total
document.querySelector('[name="qtd_caixas"]')?.addEventListener('input', updateDistStatus);

document.getElementById('btn-toggle-importador').addEventListener('click', () => {
  const wrapper = document.getElementById('importador-wrapper');
  const btn     = document.getElementById('btn-toggle-importador');
  const collapsed = wrapper.style.display === 'none';
  wrapper.style.display = collapsed ? '' : 'none';
  btn.textContent = collapsed ? '▴ Recolher' : '▾ Expandir';
});

document.getElementById('drop-planilha').addEventListener('click', () =>
  document.getElementById('file-planilha').click());
document.getElementById('drop-planilha').addEventListener('dragover', e => {
  e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)';
});
document.getElementById('drop-planilha').addEventListener('dragleave', e => {
  e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)';
});
document.getElementById('drop-planilha').addEventListener('drop', async e => {
  e.preventDefault(); e.currentTarget.style.borderColor = 'var(--border)';
  await handlePlanilha(e.dataTransfer.files?.[0]);
});
document.getElementById('file-planilha').addEventListener('change', async e =>
  await handlePlanilha(e.target.files?.[0]));
document.getElementById('btn-limpar-importacao').addEventListener('click', clearImportState);

document.getElementById('tbody-import-preview').addEventListener('click', event => {
  const button = event.target.closest('.btn-usar-import');
  if (!button) return;
  const rowIndex = Number(button.dataset.row);
  const row = importedRows[rowIndex];
  if (!row || row._saved || !row._valid) return;
  selectedImportedRowIndex = rowIndex;
  fillFormFromImportedRow(row);
  renderImportPreview();
  showToast(`Linha ${rowIndex + 1} aplicada ao formulário para conferência e entrada.`, 'success');
});

// ─────────────────────────────────────────────────────────
//  EDIÇÃO DE PALLET
// ─────────────────────────────────────────────────────────
let editAcCounter = 0;

function addEditAreaControle(areaVal = '', controleVal = '', qtdVal = '') {
  const list = document.getElementById('edit-ac-list');
  const id = ++editAcCounter;
  const row = document.createElement('div');
  row.className = 'ac-row';
  row.dataset.id = id;
  row.innerHTML = `
    <div class="field">
      <label>Área</label>
      <input type="text" data-field="area" placeholder="Ex: T-01" value="${escapeHtml(areaVal)}" required oninput="updateEditDistStatus()">
    </div>
    <div class="field">
      <label>Controle</label>
      <input type="text" data-field="controle" placeholder="Ex: CTRL-01" value="${escapeHtml(controleVal)}" required>
    </div>
    <div class="field">
      <label>Qtde cx p/controle</label>
      <input type="number" data-field="qtd_caixas" placeholder="0" min="1" value="${qtdVal}" required oninput="updateEditDistStatus()">
    </div>
    <div class="field ac-remove-wrap">
      <label>&nbsp;</label>
      <button type="button" class="ac-remove" title="Remover">✕</button>
    </div>
  `;
  row.querySelector('.ac-remove').addEventListener('click', () => {
    row.remove();
    _updateEditRemoveButtons();
    updateEditDistStatus();
  });
  list.appendChild(row);
  _updateEditRemoveButtons();
  updateEditDistStatus();
}

function _updateEditRemoveButtons() {
  const rows = document.querySelectorAll('#edit-ac-list .ac-row');
  rows.forEach(row => {
    const wrap = row.querySelector('.ac-remove-wrap');
    if (wrap) wrap.style.display = rows.length === 1 ? 'none' : '';
  });
}

function updateEditDistStatus() {
  const statusEl = document.getElementById('edit-dist-status');
  const total = Number(document.getElementById('edit-qtd_caixas')?.value) || 0;
  const dist  = Array.from(document.querySelectorAll('#edit-ac-list .ac-row'))
    .reduce((s, r) => s + (Number(r.querySelector('[data-field="qtd_caixas"]').value) || 0), 0);
  const rows = document.querySelectorAll('#edit-ac-list .ac-row').length;
  if (!total || !rows) { statusEl.className = 'dist-status'; statusEl.textContent = ''; return; }
  if (dist === total) {
    statusEl.className = 'dist-status ok';
    statusEl.textContent = `✔ Distribuição correta: ${dist} / ${total} caixas alocadas.`;
  } else if (dist > total) {
    statusEl.className = 'dist-status warn';
    statusEl.textContent = `✖ Excesso de ${dist - total} caixas — distribua apenas ${total}.`;
  } else {
    statusEl.className = 'dist-status info';
    statusEl.textContent = `⚠ Faltam ${total - dist} caixas para completar a distribuição.`;
  }
}

function _collectEditAreasControles() {
  return Array.from(document.querySelectorAll('#edit-ac-list .ac-row')).map(row => ({
    area:       row.querySelector('[data-field="area"]').value.trim(),
    controle:   row.querySelector('[data-field="controle"]').value.trim(),
    qtd_caixas: Number(row.querySelector('[data-field="qtd_caixas"]').value),
  }));
}

function _setEditSelect(id, value) {
  const el = document.getElementById(id);
  if (!el) return;
  const match = Array.from(el.options).find(o => o.value === String(value))
    || Array.from(el.options).find(o => o.value.toUpperCase() === String(value).toUpperCase());
  if (match) el.value = match.value;
}

async function abrirEditar(encodedId) {
  const id = decodeURIComponent(encodedId);
  try {
    const p = await api.get(`/recepcao/${encodeURIComponent(id)}`);
    document.getElementById('edit-pallet-id').value       = p.id;
    document.getElementById('edit-pallet-id-label').textContent = p.id;
    document.getElementById('edit-nro_pallet').value      = p.nro_pallet   || '';
    document.getElementById('edit-qtd_caixas').value      = p.qtd_caixas   || '';
    document.getElementById('edit-data_embalamento').value = p.data_embalamento || '';
    document.getElementById('edit-safra').value           = p.safra        || '';
    document.getElementById('edit-rotulo').value          = p.rotulo       || '';
    document.getElementById('edit-produtor').value        = p.produtor     || '';
    document.getElementById('edit-temp_entrada').value    = p.temp_entrada || '';
    _setEditSelect('edit-variedade',    p.variedade);
    _setEditSelect('edit-classificacao', p.classificacao);
    _setEditSelect('edit-embalagem',    p.embalagem);
    _setEditSelect('edit-caixa',        p.caixa);
    _setEditSelect('edit-peso',         p.peso);
    _setEditSelect('edit-mercado',      p.mercado);
    _setEditSelect('edit-tunel',        p.tunel);
    _setEditSelect('edit-boca',         p.boca);

    document.getElementById('edit-ac-list').innerHTML = '';
    editAcCounter = 0;
    const areas = p.areas_controles?.length
      ? p.areas_controles
      : [{ area: p.area || '', controle: p.controle || '', qtd_caixas: p.qtd_caixas }];
    areas.forEach(ac => addEditAreaControle(ac.area, ac.controle, ac.qtd_caixas));

    document.getElementById('modal-editar-pallet').style.display = 'flex';
  } catch (e) {
    showToast('Erro ao carregar pallet: ' + e.message, 'error');
  }
}

function fecharModalEditar() {
  document.getElementById('modal-editar-pallet').style.display = 'none';
}

async function salvarEdicao() {
  const id          = document.getElementById('edit-pallet-id').value;
  const qtdCaixas   = Number(document.getElementById('edit-qtd_caixas').value);
  const areasControles = _collectEditAreasControles();

  const totalDist = areasControles.reduce((s, ac) => s + ac.qtd_caixas, 0);
  if (totalDist !== qtdCaixas) {
    showToast(`A soma das caixas por área (${totalDist}) deve ser igual ao total (${qtdCaixas}).`, 'error');
    return;
  }
  const hasEmpty = areasControles.some(ac => !ac.area || !ac.controle || !ac.qtd_caixas);
  if (hasEmpty) {
    showToast('Preencha todos os campos de Área, Controle e Qtd Caixas.', 'error');
    return;
  }

  const body = {
    nro_pallet:       document.getElementById('edit-nro_pallet').value.trim(),
    qtd_caixas:       qtdCaixas,
    data_embalamento: document.getElementById('edit-data_embalamento').value,
    safra:            document.getElementById('edit-safra').value.trim(),
    variedade:        document.getElementById('edit-variedade').value,
    classificacao:    document.getElementById('edit-classificacao').value,
    embalagem:        document.getElementById('edit-embalagem').value,
    rotulo:           document.getElementById('edit-rotulo').value.trim(),
    produtor:         document.getElementById('edit-produtor').value.trim(),
    caixa:            document.getElementById('edit-caixa').value,
    peso:             Number(document.getElementById('edit-peso').value),
    mercado:          document.getElementById('edit-mercado').value,
    temp_entrada:     Number(document.getElementById('edit-temp_entrada').value),
    tunel:            document.getElementById('edit-tunel').value,
    boca:             Number(document.getElementById('edit-boca').value),
    areas_controles:  areasControles,
  };

  try {
    await api.put(`/recepcao/${encodeURIComponent(id)}`, body);
    showToast(`Pallet ${id} atualizado com sucesso.`, 'success');
    fecharModalEditar();
    loadPallets();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

// ─────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────
bindFotoInput('foto-temp-entrada',   'recepcao', 'temp_entrada',    'preview-temp-entrada',   'status-temp-entrada');
bindFotoInput('foto-espelho',        'recepcao', 'espelho',         'preview-espelho',         'status-espelho');
bindFotoInput('foto-pallet-entrada', 'recepcao', 'pallet_entrada',  'preview-pallet-entrada',  'status-pallet-entrada');

renderImportPreview();
addAreaControle();   // inicia com uma linha vazia
loadPallets();
