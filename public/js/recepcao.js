const REQUIRED_IMPORT_FIELDS = [
  'nro_pallet', 'qtd_caixas', 'data_embalamento', 'variedade', 'classificacao',
  'safra', 'embalagem', 'rotulo', 'produtor', 'caixa', 'peso', 'area',
  'controle', 'mercado', 'temp_entrada', 'tunel', 'boca'
];

const COLUMN_ALIASES = {
  nro_pallet: ['número', 'numero', 'nº', 'n°', 'nro', 'pallet', 'nº do pallet'],
  qtd_caixas: ['qtde. caixas', 'qtde caixas', 'qtd caixas', 'quantidade de caixas', 'caixas'],
  data_embalamento: ['data de embalamento', 'data embalamento', 'embalamento', 'data embal.'],
  variedade: ['variedade'],
  classificacao: ['classificação', 'classificacao'],
  safra: ['safra'],
  etiqueta: ['etiqueta', 'rótulo', 'rotulo'],
  apelido_talhao: ['apelido talhã', 'apelido talhao', 'talhão', 'talhao', 'área', 'area'],
  controle: ['controle'],
  embalagem_raw: ['embalagem'],
  produtor_raw: ['produtor'],
  caixa_raw: ['caixa'],
  peso_raw: ['peso']
};

let importedRows = [];
let importedFileName = '';

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
    const key = normalizeHeader(alias);
    if (headersMap[key] !== undefined) return headersMap[key];
  }
  return null;
}

function excelDateToISO(value) {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'number' && window.XLSX?.SSF?.parse_date_code) {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (parsed?.y && parsed?.m && parsed?.d) {
      return `${parsed.y.toString().padStart(4, '0')}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
    }
  }

  const raw = asText(value);
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;

  const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
  if (br) {
    const day = br[1].padStart(2, '0');
    const month = br[2].padStart(2, '0');
    const year = br[3].length === 2 ? `20${br[3]}` : br[3];
    return `${year}-${month}-${day}`;
  }

  const date = new Date(raw);
  if (!Number.isNaN(date.getTime())) return date.toISOString().slice(0, 10);
  return '';
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return value;
  const normalized = asText(value).replace(/\./g, '').replace(',', '.');
  const match = normalized.match(/-?\d+(\.\d+)?/);
  return match ? Number(match[0]) : null;
}

function normalizeEmbalagem(value) {
  const txt = normalizeHeader(value).toUpperCase();
  if (!txt) return '';
  if (txt.includes('FECHADA')) return 'CUMBUCA FECHADA';
  if (txt.includes('OPEN TOP') || txt.includes('OPEN')) return 'CUMBUCA ABERTA';
  if (txt.includes('SACOLA')) return 'SACOLA';
  return '';
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
  const txt = normalizeHeader(classificacao);
  return txt.includes('exportacao') ? 'EXTERNO' : 'INTERNO';
}

function validateImportRow(row) {
  const missing = [];
  for (const field of REQUIRED_IMPORT_FIELDS) {
    const value = row[field];
    if (value === '' || value === null || value === undefined) missing.push(field);
  }

  if (row.tunel && !['01', '02'].includes(String(row.tunel))) missing.push('tunel');

  if (row.boca !== '' && row.boca !== null && row.boca !== undefined) {
    const boca = Number(row.boca);
    if (!Number.isInteger(boca) || boca < 1 || boca > 12) missing.push('boca');
  }

  row._missing = [...new Set(missing)];
  row._valid = row._missing.length === 0;
}

function buildPayload(row) {
  return {
    nro_pallet: String(row.nro_pallet).trim(),
    qtd_caixas: Number(row.qtd_caixas),
    data_embalamento: row.data_embalamento,
    variedade: String(row.variedade).trim(),
    classificacao: String(row.classificacao).trim(),
    safra: String(row.safra).trim(),
    embalagem: String(row.embalagem).trim(),
    rotulo: String(row.rotulo).trim(),
    produtor: String(row.produtor).trim(),
    caixa: String(row.caixa).trim(),
    peso: Number(row.peso),
    area: String(row.area).trim(),
    controle: String(row.controle).trim(),
    mercado: String(row.mercado).trim(),
    temp_entrada: Number(row.temp_entrada),
    tunel: String(row.tunel).padStart(2, '0'),
    boca: Number(row.boca)
  };
}

function fillFormFromRow(row) {
  const form = document.getElementById('form-recepcao');
  const payload = buildPayload(row);
  Object.entries(payload).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) field.value = value;
  });
}

function fieldEditorHtml(rowIndex, field, value) {
  if (field === 'tunel') {
    return `
      <select data-row="${rowIndex}" data-field="${field}" class="import-field-input">
        <option value="01" ${String(value) === '01' ? 'selected' : ''}>01</option>
        <option value="02" ${String(value) === '02' ? 'selected' : ''}>02</option>
      </select>`;
  }

  if (field === 'mercado') {
    return `
      <select data-row="${rowIndex}" data-field="${field}" class="import-field-input">
        <option value="EXTERNO" ${String(value) === 'EXTERNO' ? 'selected' : ''}>EXTERNO</option>
        <option value="INTERNO" ${String(value) === 'INTERNO' ? 'selected' : ''}>INTERNO</option>
      </select>`;
  }

  if (field === 'embalagem') {
    return `
      <select data-row="${rowIndex}" data-field="${field}" class="import-field-input">
        <option value="">Selecione</option>
        <option value="CUMBUCA FECHADA" ${String(value) === 'CUMBUCA FECHADA' ? 'selected' : ''}>CUMBUCA FECHADA</option>
        <option value="CUMBUCA ABERTA" ${String(value) === 'CUMBUCA ABERTA' ? 'selected' : ''}>CUMBUCA ABERTA</option>
        <option value="SACOLA" ${String(value) === 'SACOLA' ? 'selected' : ''}>SACOLA</option>
      </select>`;
  }

  const type = ['qtd_caixas', 'peso', 'temp_entrada', 'boca'].includes(field)
    ? 'number'
    : field === 'data_embalamento'
      ? 'date'
      : 'text';
  const step = field === 'peso' ? '0.01' : field === 'temp_entrada' ? '0.1' : '1';
  const min = field === 'boca' ? '1' : '';
  const max = field === 'boca' ? '12' : '';

  return `<input data-row="${rowIndex}" data-field="${field}" class="import-field-input" type="${type}" value="${escapeHtml(value)}" ${type === 'number' ? `step="${step}"` : ''} ${min ? `min="${min}"` : ''} ${max ? `max="${max}"` : ''}>`;
}

function renderImportPreview() {
  const tbody = document.getElementById('tbody-import-preview');
  const wrap = document.getElementById('import-preview-wrap');
  const summary = document.getElementById('import-summary');

  if (!importedRows.length) {
    wrap.style.display = 'none';
    summary.textContent = importedFileName ? `Arquivo ${importedFileName} sem linhas válidas para exibição.` : 'Nenhuma planilha carregada.';
    return;
  }

  wrap.style.display = 'block';
  const validCount = importedRows.filter(row => row._valid && !row._saved).length;
  const savedCount = importedRows.filter(row => row._saved).length;
  summary.textContent = `Arquivo: ${importedFileName} · ${importedRows.length} linha(s) · ${validCount} pronta(s) · ${savedCount} importada(s)`;

  tbody.innerHTML = importedRows.map((row, index) => {
    const status = row._saved
      ? '<span class="badge-status badge-livre">Importado</span>'
      : row._valid
        ? '<span class="badge-status badge-ocupada">Pronto</span>'
        : `<span class="badge-status badge-warning">Pendente</span><div class="text-muted" style="margin-top:4px; font-size:.75rem;">${escapeHtml(row._missing.join(', '))}</div>`;

    return `
      <tr>
        <td>${index + 1}</td>
        <td>${status}</td>
        <td>${fieldEditorHtml(index, 'nro_pallet', row.nro_pallet)}</td>
        <td>${fieldEditorHtml(index, 'qtd_caixas', row.qtd_caixas)}</td>
        <td>${fieldEditorHtml(index, 'data_embalamento', row.data_embalamento)}</td>
        <td>${fieldEditorHtml(index, 'variedade', row.variedade)}</td>
        <td>${fieldEditorHtml(index, 'classificacao', row.classificacao)}</td>
        <td>${fieldEditorHtml(index, 'safra', row.safra)}</td>
        <td>${fieldEditorHtml(index, 'embalagem', row.embalagem)}</td>
        <td>${fieldEditorHtml(index, 'rotulo', row.rotulo)}</td>
        <td>${fieldEditorHtml(index, 'produtor', row.produtor)}</td>
        <td>${fieldEditorHtml(index, 'caixa', row.caixa)}</td>
        <td>${fieldEditorHtml(index, 'peso', row.peso ?? '')}</td>
        <td>${fieldEditorHtml(index, 'area', row.area)}</td>
        <td>${fieldEditorHtml(index, 'controle', row.controle)}</td>
        <td>${fieldEditorHtml(index, 'mercado', row.mercado)}</td>
        <td>${fieldEditorHtml(index, 'temp_entrada', row.temp_entrada ?? '')}</td>
        <td>${fieldEditorHtml(index, 'tunel', row.tunel || '01')}</td>
        <td>${fieldEditorHtml(index, 'boca', row.boca ?? '')}</td>
        <td style="white-space:nowrap;">
          <button class="btn btn-ghost btn-sm btn-usar-import" data-row="${index}" type="button">Usar</button>
          <button class="btn btn-primary btn-sm btn-registrar-linha" data-row="${index}" type="button" ${row._saved ? 'disabled' : ''}>Registrar</button>
        </td>
      </tr>`;
  }).join('');
}

function updateImportedRow(rowIndex, field, value) {
  const row = importedRows[rowIndex];
  if (!row) return;

  if (['qtd_caixas', 'peso', 'temp_entrada', 'boca'].includes(field)) {
    row[field] = value === '' ? '' : Number(value);
  } else {
    row[field] = value;
  }

  if (field === 'classificacao') row.mercado = normalizeMercado(value);
  validateImportRow(row);
  renderImportPreview();
}

function parseWorksheetRows(rows) {
  if (!rows.length) throw new Error('A planilha está vazia.');

  const rawHeaders = rows[0].map(value => asText(value));
  const headersMap = {};
  rawHeaders.forEach((header, idx) => {
    headersMap[normalizeHeader(header)] = idx;
  });

  const requiredColumns = ['nro_pallet', 'qtd_caixas', 'data_embalamento', 'variedade', 'classificacao', 'safra', 'etiqueta', 'apelido_talhao', 'controle'];
  const missingColumns = requiredColumns.filter(key => findColumnKey(headersMap, COLUMN_ALIASES[key]) === null);
  if (missingColumns.length) {
    throw new Error(`Colunas obrigatórias não encontradas: ${missingColumns.join(', ')}`);
  }

  const col = {};
  Object.entries(COLUMN_ALIASES).forEach(([key, aliases]) => {
    col[key] = findColumnKey(headersMap, aliases);
  });

  const defaultTemp = Number(document.getElementById('import-default-temp').value || 0);
  const defaultTunel = document.getElementById('import-default-tunel').value || '01';
  const defaultBoca = Number(document.getElementById('import-default-boca').value || 1);

  importedRows = rows.slice(1)
    .filter(row => row.some(cell => asText(cell) !== ''))
    .map((row, index) => {
      const classificacao = asText(row[col.classificacao]);
      const parsed = {
        _sheetRow: index + 2,
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
        mercado: normalizeMercado(classificacao),
        temp_entrada: defaultTemp,
        tunel: defaultTunel,
        boca: defaultBoca
      };
      validateImportRow(parsed);
      return parsed;
    });

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
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
      parseWorksheetRows(rows);
      showToast(`Planilha ${file.name} carregada com sucesso.`, 'success');
    } catch (error) {
      importedRows = [];
      renderImportPreview();
      document.getElementById('import-errors').textContent = error.message;
      showToast(`Erro ao processar planilha: ${error.message}`, 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function clearImportState() {
  importedRows = [];
  importedFileName = '';
  document.getElementById('file-planilha').value = '';
  document.getElementById('import-errors').textContent = '';
  renderImportPreview();
}

async function registerImportedRow(rowIndex) {
  const row = importedRows[rowIndex];
  if (!row) return;

  validateImportRow(row);
  if (!row._valid) {
    renderImportPreview();
    showToast(`Linha ${rowIndex + 1} ainda possui campos pendentes.`, 'error');
    return;
  }

  try {
    const payload = buildPayload(row);
    const created = await api.post('/recepcao/', payload);
    row._saved = true;
    renderImportPreview();
    fillFormFromRow(row);
    await loadPallets();
    showToast(`Linha ${rowIndex + 1} registrada como pallet ${created.id}.`, 'success');
  } catch (error) {
    showToast(`Erro ao registrar linha ${rowIndex + 1}: ${error.message}`, 'error');
  }
}

async function registerAllImportedRows() {
  const pending = importedRows
    .map((row, index) => ({ row, index }))
    .filter(item => item.row._valid && !item.row._saved);

  if (!pending.length) {
    showToast('Não há linhas válidas pendentes para registrar.', 'info');
    return;
  }

  for (const item of pending) {
    await registerImportedRow(item.index);
  }
}

function applyDefaultsToImportedRows() {
  const defaultTemp = document.getElementById('import-default-temp').value;
  const defaultTunel = document.getElementById('import-default-tunel').value;
  const defaultBoca = document.getElementById('import-default-boca').value;

  importedRows.forEach(row => {
    if (row.temp_entrada === '' || row.temp_entrada === null || row.temp_entrada === undefined) row.temp_entrada = Number(defaultTemp || 0);
    if (!row.tunel) row.tunel = defaultTunel || '01';
    if (row.boca === '' || row.boca === null || row.boca === undefined) row.boca = Number(defaultBoca || 1);
    validateImportRow(row);
  });

  renderImportPreview();
  showToast('Padrões aplicados nas linhas com campos vazios.', 'success');
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
    const p = await api.post('/recepcao/', body);
    showToast(`Pallet ${p.id} registrado!${p.is_adicao ? ' (ADIÇÃO)' : ''}`, 'success');
    form.reset();
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
document.getElementById('btn-aplicar-padroes').addEventListener('click', applyDefaultsToImportedRows);
document.getElementById('btn-registrar-importaveis').addEventListener('click', registerAllImportedRows);

document.getElementById('tbody-import-preview').addEventListener('input', event => {
  const target = event.target;
  if (!target.matches('.import-field-input')) return;
  updateImportedRow(Number(target.dataset.row), target.dataset.field, target.value);
});

document.getElementById('tbody-import-preview').addEventListener('change', event => {
  const target = event.target;
  if (!target.matches('.import-field-input')) return;
  updateImportedRow(Number(target.dataset.row), target.dataset.field, target.value);
});

document.getElementById('tbody-import-preview').addEventListener('click', async event => {
  const useButton = event.target.closest('.btn-usar-import');
  if (useButton) {
    fillFormFromRow(importedRows[Number(useButton.dataset.row)]);
    showToast(`Linha ${Number(useButton.dataset.row) + 1} aplicada ao formulário.`, 'success');
    return;
  }

  const registerButton = event.target.closest('.btn-registrar-linha');
  if (registerButton) {
    await registerImportedRow(Number(registerButton.dataset.row));
  }
});

renderImportPreview();
loadPallets();
