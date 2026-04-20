const COLUMN_ALIASES = {
  nro_pallet: ['número', 'numero', 'nº', 'n°', 'nro', 'pallet', 'nº do pallet', 'numero pallet'],
  qtd_caixas: ['qtde. caixas', 'qtde caixas', 'qtd caixas', 'quantidade de caixas', 'caixas'],
  data_embalamento: ['data de embalamento', 'data embalamento', 'data embalagem', 'data embal.', 'data embal', 'data emb.', 'data emb', 'embalamento'],
  variedade: ['variedade'],
  classificacao: ['classificação', 'classificacao'],
  safra: ['safra'],
  etiqueta: ['etiqueta', 'rótulo', 'rotulo'],
  apelido_talhao: ['apelido talhão', 'apelido talhao', 'talhão', 'talhao', 'área', 'area'],
  controle: ['controle'],
  embalagem_raw: ['embalagem'],
  produtor_raw: ['produtor'],
  caixa_raw: ['caixa'],
  peso_raw: ['peso']
};

const REQUIRED_COLUMNS = [
  'nro_pallet',
  'qtd_caixas',
  'data_embalamento',
  'variedade',
  'classificacao',
  'safra',
  'etiqueta',
  'apelido_talhao',
  'controle'
];

let importedRows = [];
let importedFileName = '';
let selectedImportedRowIndex = null;

function normalizeHeader(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function asText(value) {
  return String(value ?? '').trim();
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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
    const normalizedCells = row.map(cell => normalizeHeader(cell)).filter(Boolean);
    if (!normalizedCells.length) return false;

    const hasPallet = normalizedCells.some(cell => cell === 'pallet' || cell.includes('pallet'));
    const hasCaixas = normalizedCells.some(cell => cell === 'caixas' || cell.includes('caixas'));
    const hasData = normalizedCells.some(cell => cell.includes('data embal'));
    const hasVariedade = normalizedCells.some(cell => cell.includes('variedade'));

    return hasPallet && hasCaixas && hasData && hasVariedade;
  });
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;

  const raw = asText(value);
  const kgLike = raw.match(/(\d+[.,]?\d*)/);
  if (!kgLike) return null;
  return Number(kgLike[1].replace(',', '.'));
}

function excelDateToISO(value) {
  if (value === null || value === undefined || value === '') return '';

  if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${String(parsed.y).padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const raw = asText(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const usOrBr = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (usOrBr) {
    const p1 = Number(usOrBr[1]);
    const p2 = Number(usOrBr[2]);
    const year = usOrBr[3].length === 2 ? `20${usOrBr[3]}` : usOrBr[3];

    let day = p1;
    let month = p2;

    if (p1 <= 12 && p2 <= 12) {
      month = p1;
      day = p2;
    } else if (p1 <= 12 && p2 > 12) {
      month = p1;
      day = p2;
    } else {
      day = p1;
      month = p2;
    }

    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  return '';
}

function formatIsoDateToBR(value) {
  if (!value) return '—';
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
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
  const tokens = asText(value).replace(/\s+/g, ' ').split(' ').filter(Boolean);
  if (!tokens.length) return '';
  if (tokens.length === 1) return tokens[0];
  return `${tokens[0]} ${tokens[tokens.length - 1]}`;
}

function normalizeCaixa(value) {
  const raw = asText(value);
  if (!raw) return '';
  const match = raw.match(/(?:\bCX\b|\bCAIXA\b)\s*[:\-]?\s*([A-Z0-9./-]+)/i);
  return match ? match[1].trim() : raw;
}

function normalizePeso(value) {
  const raw = asText(value);
  if (!raw) return parseNumber(value);
  const match = raw.match(/(\d+[.,]?\d*)\s*KG\b/i);
  if (match) return Number(match[1].replace(',', '.'));
  return parseNumber(value);
}

function normalizeMercado(classificacao) {
  const text = normalizeHeader(classificacao);
  return text.includes('exportacao') ? 'EXTERNO' : 'INTERNO';
}

function validateImportedRow(row) {
  const missing = [];
  const requiredDataFields = [
    'nro_pallet', 'qtd_caixas', 'data_embalamento', 'variedade', 'classificacao',
    'safra', 'embalagem', 'rotulo', 'produtor', 'caixa', 'peso', 'area',
    'controle', 'mercado'
  ];

  requiredDataFields.forEach(field => {
    if (row[field] === '' || row[field] === null || row[field] === undefined) {
      missing.push(field);
    }
  });

  row._missing = missing;
  row._valid = missing.length === 0;
}

function updateSelectedInfo() {
  const label = document.getElementById('selected-import-info');
  if (selectedImportedRowIndex === null || !importedRows[selectedImportedRowIndex]) {
    label.textContent = 'Nenhuma linha da planilha selecionada.';
    return;
  }

  const row = importedRows[selectedImportedRowIndex];
  label.textContent = row._saved
    ? `Linha ${selectedImportedRowIndex + 1} já importada.`
    : `Linha ${selectedImportedRowIndex + 1} selecionada para entrada manual.`;
}

function renderImportPreview() {
  const wrap = document.getElementById('import-preview-wrap');
  const tbody = document.getElementById('tbody-import-preview');
  const summary = document.getElementById('import-summary');

  if (!importedRows.length) {
    wrap.style.display = 'none';
    summary.textContent = importedFileName ? `Arquivo ${importedFileName} sem linhas válidas para exibição.` : 'Nenhuma planilha carregada.';
    updateSelectedInfo();
    return;
  }

  wrap.style.display = 'block';
  const pending = importedRows.filter(row => !row._saved).length;
  const imported = importedRows.filter(row => row._saved).length;
  summary.textContent = `Arquivo: ${importedFileName} · ${importedRows.length} linha(s) · ${pending} pendente(s) · ${imported} importada(s)`;

  tbody.innerHTML = importedRows.map((row, index) => {
    const status = row._saved
      ? '<span class="badge-status badge-livre">Já importado</span>'
      : row._valid
        ? '<span class="badge-status badge-warning">Pronto para seleção</span>'
        : `<span class="badge-status badge-danger">Erro</span><div class="text-muted" style="margin-top:4px; font-size:.75rem;">${escapeHtml(row._missing.join(', '))}</div>`;

    const selectedStyle = index === selectedImportedRowIndex ? 'background:rgba(99,102,241,.12);' : '';

    return `
      <tr style="${selectedStyle}">
        <td>${index + 1}</td>
        <td>${status}</td>
        <td><strong>${escapeHtml(row.nro_pallet)}</strong></td>
        <td>${row.qtd_caixas ?? '—'}</td>
        <td>${escapeHtml(formatIsoDateToBR(row.data_embalamento))}</td>
        <td>${escapeHtml(row.variedade)}</td>
        <td>${escapeHtml(row.classificacao)}</td>
        <td>${escapeHtml(row.embalagem)}</td>
        <td>${escapeHtml(row.produtor)}</td>
        <td>${escapeHtml(row.caixa)}</td>
        <td>${row.peso ?? '—'}${row.peso ? ' kg' : ''}</td>
        <td>${escapeHtml(row.area)}</td>
        <td>${escapeHtml(row.controle)}</td>
        <td>
          <button class="btn btn-ghost btn-sm btn-usar-import" data-row="${index}" type="button" ${row._saved || !row._valid ? 'disabled' : ''}>↓ Usar</button>
        </td>
      </tr>`;
  }).join('');

  updateSelectedInfo();
}

function fillFormFromImportedRow(row) {
  const form = document.getElementById('form-recepcao');
  const payload = {
    nro_pallet: row.nro_pallet,
    qtd_caixas: row.qtd_caixas ?? '',
    data_embalamento: row.data_embalamento,
    variedade: row.variedade,
    classificacao: row.classificacao,
    safra: row.safra,
    embalagem: row.embalagem,
    rotulo: row.rotulo,
    produtor: row.produtor,
    caixa: row.caixa,
    peso: row.peso ?? '',
    area: row.area,
    controle: row.controle,
    mercado: row.mercado
  };

  Object.entries(payload).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
}

function clearImportState() {
  importedRows = [];
  importedFileName = '';
  selectedImportedRowIndex = null;
  document.getElementById('file-planilha').value = '';
  document.getElementById('import-errors').textContent = '';
  renderImportPreview();
}

function parseWorksheetRows(rows) {
  if (!rows.length) throw new Error('A planilha está vazia.');

  const headerRowIndex = findHeaderRowIndex(rows);
  if (headerRowIndex === -1) {
    throw new Error('Cabeçalho da planilha não encontrado.');
  }

  const headers = rows[headerRowIndex].map(cell => asText(cell));
  const headersMap = {};
  headers.forEach((header, index) => {
    headersMap[normalizeHeader(header)] = index;
  });

  const missingColumns = REQUIRED_COLUMNS.filter(key => {
    const aliases = COLUMN_ALIASES[key];
    return !aliases || findColumnKey(headersMap, aliases) === null;
  });

  if (missingColumns.length) {
    throw new Error(`Colunas obrigatórias não encontradas: ${missingColumns.join(', ')}`);
  }

  const col = {};
  Object.entries(COLUMN_ALIASES).forEach(([key, aliases]) => {
    col[key] = findColumnKey(headersMap, aliases);
  });

  importedRows = rows
    .slice(headerRowIndex + 1)
    .filter(row => row.some(cell => asText(cell) !== ''))
    .map(row => {
      const classificacao = asText(row[col.classificacao]);
      const parsed = {
        _saved: false,
        nro_pallet: asText(row[col.nro_pallet]),
        qtd_caixas: parseNumber(row[col.qtd_caixas]),
        data_embalamento: excelDateToISO(row[col.data_embalamento]),
        variedade: asText(row[col.variedade]),
        classificacao,
        safra: asText(row[col.safra]),
        embalagem: normalizeEmbalagem(col.embalagem_raw !== null ? row[col.embalagem_raw] : ''),
        rotulo: asText(row[col.etiqueta]),
        produtor: normalizeProdutor(col.produtor_raw !== null ? row[col.produtor_raw] : ''),
        caixa: normalizeCaixa(col.caixa_raw !== null ? row[col.caixa_raw] : ''),
        peso: normalizePeso(col.peso_raw !== null ? row[col.peso_raw] : ''),
        area: asText(row[col.apelido_talhao]),
        controle: asText(row[col.controle]),
        mercado: normalizeMercado(classificacao)
      };

      validateImportedRow(parsed);
      return parsed;
    })
    .filter(row => row.nro_pallet || row.qtd_caixas || row.data_embalamento);

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
      const data = event.target.result;
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(firstSheet, { header: 1, defval: '' });
      parseWorksheetRows(rows);
      showToast(`Planilha ${file.name} carregada com sucesso.`, 'success');
    } catch (error) {
      importedRows = [];
      selectedImportedRowIndex = null;
      renderImportPreview();
      document.getElementById('import-errors').textContent = error.message;
      showToast(`Erro ao processar planilha: ${error.message}`, 'error');
    }
  };

  reader.readAsArrayBuffer(file);
}

async function loadPallets() {
  try {
    const pallets = await api.get('/recepcao/');
    const tbody = document.getElementById('tbody-recepcao');

    if (!pallets.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-muted">Nenhum pallet em recepção.</td></tr>';
      return;
    }

    tbody.innerHTML = pallets.map(p => `
      <tr>
        <td><strong>${escapeHtml(p.id)}</strong>${p.is_adicao ? ' <span class="badge-status badge-warning" style="font-size:.65rem">ADIÇÃO</span>' : ''}</td>
        <td>${escapeHtml(p.variedade)}</td>
        <td>${p.qtd_caixas}</td>
        <td>${escapeHtml(p.produtor)}</td>
        <td>T${escapeHtml(p.tunel)}</td>
        <td>${p.boca}</td>
        <td>${p.temp_entrada}°C</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="rollback('${encodeURIComponent(p.id)}')">Rollback</button>
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
  } catch (e) {
    showToast(e.message, 'error');
  }
}

document.getElementById('btn-registrar').addEventListener('click', async () => {
  const form = document.getElementById('form-recepcao');
  const fd = new FormData(form);
  const body = Object.fromEntries(fd.entries());

  body.qtd_caixas = Number(body.qtd_caixas);
  body.peso = Number(body.peso);
  body.temp_entrada = Number(body.temp_entrada);
  body.boca = Number(body.boca);

  try {
    const created = await api.post('/recepcao/', body);
    showToast(`Pallet ${created.id} registrado!${created.is_adicao ? ' (ADIÇÃO)' : ''}`, 'success');

    if (selectedImportedRowIndex !== null && importedRows[selectedImportedRowIndex]) {
      importedRows[selectedImportedRowIndex]._saved = true;
      renderImportPreview();
    }

    form.reset();
    selectedImportedRowIndex = null;
    updateSelectedInfo();
    loadPallets();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

document.getElementById('btn-refresh').addEventListener('click', loadPallets);

document.getElementById('btn-toggle-importador').addEventListener('click', () => {
  const wrapper = document.getElementById('importador-wrapper');
  const button = document.getElementById('btn-toggle-importador');
  const collapsed = wrapper.style.display === 'none';
  wrapper.style.display = collapsed ? '' : 'none';
  button.textContent = collapsed ? '▴ Recolher' : '▾ Expandir';
});

document.getElementById('drop-planilha').addEventListener('click', () => {
  document.getElementById('file-planilha').click();
});

document.getElementById('drop-planilha').addEventListener('dragover', event => {
  event.preventDefault();
  event.currentTarget.style.borderColor = 'var(--accent)';
});

document.getElementById('drop-planilha').addEventListener('dragleave', event => {
  event.preventDefault();
  event.currentTarget.style.borderColor = 'var(--border)';
});

document.getElementById('drop-planilha').addEventListener('drop', async event => {
  event.preventDefault();
  event.currentTarget.style.borderColor = 'var(--border)';
  const file = event.dataTransfer.files?.[0];
  await handlePlanilha(file);
});

document.getElementById('file-planilha').addEventListener('change', async event => {
  const file = event.target.files?.[0];
  await handlePlanilha(file);
});

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

renderImportPreview();
loadPallets();
