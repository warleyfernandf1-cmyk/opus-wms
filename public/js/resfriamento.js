/**
 * resfriamento.js
 * 
 * Fluxo:
 *  1. Operador seleciona o túnel (01 ou 02)
 *  2. Grade de 12 bocas é renderizada — bocas ocupadas mostram o pallet
 *  3. Clicar numa boca ocupada abre o painel de detalhe
 *  4. Operador informa temperatura de polpa + observação e confirma saída
 *  5. Pallet é movido para "aguardando armazenamento" (fase armazenamento, sem posição)
 *
 * Label de sessão: "T01 - 1ª Remessa - S16"
 *  - Túnel vem da sessão ativa
 *  - Remessa = total de sessões do dia naquele túnel (incluindo a ativa)
 *  - Semana ISO calculada no frontend
 */

/* ─── estado global ─────────────────────────────────────────── */
let tunelAtivo = '01';
let bocaSelecionada = null;   // número da boca (int)
let palletSelecionado = null; // objeto do pallet
let dadosTuneis = {};         // resposta de GET /resfriamento/tuneis
let sessaoAtiva = null;       // objeto da sessão ativa do túnel corrente

/* ─── helpers ───────────────────────────────────────────────── */

/** Semana ISO do ano para uma data */
function semanaISO(date = new Date()) {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const inicio = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d - inicio) / 86400000) + 1) / 7);
}

/** Ordinal em português: 1ª, 2ª, 3ª … */
function ordinal(n) {
  return `${n}ª`;
}

/**
 * Monta o label legível da sessão.
 * @param {string} tunel - "01" ou "02"
 * @param {number} remessa - contagem de sessões do dia naquele túnel
 */
function labelSessao(tunel, remessa) {
  const semana = semanaISO();
  return `T${tunel} - ${ordinal(remessa)} Remessa - S${semana}`;
}

/** Busca sessões do dia para um túnel e retorna a contagem (remessa) */
async function calcularRemessa(tunel) {
  try {
    // Busca todas as sessões do túnel; filtramos pelo dia no frontend
    const sessoes = await api.get(`/resfriamento/sessoes?tunel=${tunel}`);
    const hoje = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
    return sessoes.filter(s => s.iniciado_em && s.iniciado_em.startsWith(hoje)).length;
  } catch {
    return 1; // fallback seguro
  }
}

/* ─── renderização ──────────────────────────────────────────── */

function renderBocas() {
  const grid = document.getElementById('bocas-grid');
  const bocas = dadosTuneis[tunelAtivo] || {};

  grid.innerHTML = Array.from({ length: 12 }, (_, i) => {
    const b = i + 1;
    const pallets = bocas[String(b)] || [];
    const p = pallets[0]; // um pallet por boca
    const selecionada = bocaSelecionada === b;

    if (p) {
      return `<div class="boca-card ocupada${selecionada ? ' selecionada' : ''}"
                   onclick="abrirDetalhe(${b})">
        <span class="boca-num">Boca ${b}</span>
        <span class="boca-pallet">${p.id}</span>
        <span class="boca-var">${p.variedade || '—'}</span>
        <span class="boca-temp">${p.temp_entrada != null ? p.temp_entrada + '°C' : '—'}</span>
      </div>`;
    }
    return `<div class="boca-card">
      <span class="boca-num">Boca ${b}</span>
      <span class="boca-vazia">Vazia</span>
    </div>`;
  }).join('');
}

async function renderSessaoBar() {
  const bar = document.getElementById('sessao-bar');
  const labelEl = document.getElementById('sessao-label');
  const infoEl = document.getElementById('sessao-info');

  if (!sessaoAtiva) {
    bar.style.display = 'none';
    return;
  }

  const remessa = await calcularRemessa(tunelAtivo);
  const label = labelSessao(tunelAtivo, remessa);

  const criada = sessaoAtiva.iniciado_em
    ? new Date(sessaoAtiva.iniciado_em).toLocaleString('pt-BR')
    : '—';

  // Conta pallets em resfriamento neste túnel
  const bocas = dadosTuneis[tunelAtivo] || {};
  const totalPallets = Object.values(bocas)
    .flat()
    .filter(p => p.fase === 'resfriamento').length;

  labelEl.textContent = label;
  infoEl.textContent = `Criada em ${criada} · Pallets na sessão: ${totalPallets}`;
  bar.style.display = 'flex';
}

async function renderAguardando() {
  const container = document.getElementById('aw-container');
  try {
    // Pallets em fase armazenamento sem posição definida = aguardando alocação
    const pallets = await api.get('/armazenamento/aguardando');
    if (!pallets || pallets.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhum pallet aguardando armazenamento.</span>';
      return;
    }
    container.innerHTML = `
      <table class="aw-table">
        <thead>
          <tr>
            <th>N° Pallet</th>
            <th>Variedade</th>
            <th>Classif.</th>
            <th>Produtor</th>
            <th>Túnel / Boca</th>
            <th>Temp. entrada</th>
            <th>Temp. polpa</th>
            <th>Registrado em</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${pallets.map(p => `
            <tr>
              <td style="font-weight:600">${p.id}</td>
              <td>${p.variedade || '—'}</td>
              <td><span class="badge-${(p.classificacao || '').toLowerCase() === 'good' ? 'good' : 'frutibras'}">${p.classificacao || '—'}</span></td>
              <td>${p.produtor || '—'}</td>
              <td>TÚNEL ${p.tunel || '—'} · Boca ${p.boca || '—'}</td>
              <td>${p.temp_entrada != null ? p.temp_entrada + '°C' : '—'}</td>
              <td>${p.temp_saida != null ? p.temp_saida + '°C' : '—'}</td>
              <td>${p.updated_at ? new Date(p.updated_at).toLocaleString('pt-BR') : '—'}</td>
              <td>
                <a href="armazenamento.html" class="btn btn-primary btn-sm">→ Armazenar</a>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    container.innerHTML = `<span style="color:var(--danger);font-size:.82rem">Erro ao carregar: ${e.message}</span>`;
  }
}

/* ─── seleção de túnel ──────────────────────────────────────── */

async function selectTunel(tunel) {
  tunelAtivo = tunel;
  bocaSelecionada = null;
  palletSelecionado = null;
  fecharDetalhe();

  document.getElementById('tab-t01').classList.toggle('active', tunel === '01');
  document.getElementById('tab-t02').classList.toggle('active', tunel === '02');
  document.getElementById('bocas-titulo').textContent = `Túnel ${tunel} — Bocas`;

  // Sessão ativa do túnel selecionado
  try {
    const sessoes = await api.get(`/resfriamento/sessoes?tunel=${tunel}&status=ativa`);
    sessaoAtiva = sessoes && sessoes.length > 0 ? sessoes[0] : null;
  } catch {
    sessaoAtiva = null;
  }

  renderBocas();
  await renderSessaoBar();
}

/* ─── detalhe da boca ───────────────────────────────────────── */

function abrirDetalhe(boca) {
  const bocas = dadosTuneis[tunelAtivo] || {};
  const pallets = bocas[String(boca)] || [];
  if (!pallets.length) return;

  bocaSelecionada = boca;
  palletSelecionado = pallets[0];
  renderBocas();

  const p = palletSelecionado;
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

  document.getElementById('input-temp-polpa').value = '';
  document.getElementById('input-obs').value = '';

  const panel = document.getElementById('detalhe-panel');
  panel.classList.add('ativo');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fecharDetalhe() {
  bocaSelecionada = null;
  palletSelecionado = null;
  document.getElementById('detalhe-panel').classList.remove('ativo');
  renderBocas();
}

/* ─── confirmar saída ───────────────────────────────────────── */

document.getElementById('btn-confirmar-saida').addEventListener('click', async () => {
  if (!palletSelecionado) return;

  const tempPolpa = parseFloat(document.getElementById('input-temp-polpa').value);
  if (isNaN(tempPolpa)) {
    showToast('Informe a temperatura de polpa.', 'error');
    return;
  }

  const obs = document.getElementById('input-obs').value.trim();

  try {
    await api.post(`/resfriamento/saida-pallet`, {
      pallet_id: palletSelecionado.id,
      sessao_id: sessaoAtiva?.id || null,
      temp_polpa: tempPolpa,
      observacao: obs || null,
    });
    showToast(`Pallet ${palletSelecionado.id} saiu do túnel com sucesso.`, 'success');
    fecharDetalhe();
    await init();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

/* ─── inicialização ─────────────────────────────────────────── */

async function init() {
  try {
    dadosTuneis = await api.get('/resfriamento/tuneis');
  } catch (e) {
    showToast('Erro ao carregar túneis: ' + e.message, 'error');
    dadosTuneis = {};
  }
  renderBocas();
  await selectTunel(tunelAtivo);
  await renderAguardando();
}

init();
