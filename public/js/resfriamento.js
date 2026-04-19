/**
 * resfriamento.js
 *
 * Regras:
 * - Cada pallet ocupa seu próprio card de boca (mesmo que dois pallets estejam na boca 1)
 * - Temperatura é salva localmente por pallet até que todos estejam preenchidos
 * - Botão "Concluir Sessão" só habilita quando 100% dos pallets têm temperatura
 * - Ao concluir, chama finalizar_sessao que move todos para armazenamento atomicamente
 *
 * Label de sessão: "T01 - 1ª Remessa - S16"
 */

/* ─── estado global ─────────────────────────────────────────── */
let tunelAtivo = '01';
let palletSelecionadoId = null;   // id do pallet com painel aberto
let dadosTuneis = {};             // { "01": { "1": [pallet,...], ... }, "02": {...} }
let sessaoAtiva = null;           // objeto da sessão ativa do túnel corrente
let tempsLocais = {};             // { pallet_id: { temp, obs } } — salvo antes de concluir

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

/** Retorna lista flat de todos os pallets do túnel ativo */
function palletsDoTunel() {
  const bocas = dadosTuneis[tunelAtivo] || {};
  return Object.values(bocas).flat();
}

/* ─── renderização das bocas ────────────────────────────────── */

function renderBocas() {
  const grid = document.getElementById('bocas-grid');
  const bocas = dadosTuneis[tunelAtivo] || {};

  // Expande: um card por pallet (mesmo que compartilhem a boca)
  const cards = [];
  for (let b = 1; b <= 12; b++) {
    const pallets = bocas[String(b)] || [];
    if (pallets.length === 0) {
      // Boca vazia — mostra um card vazio por boca
      cards.push(`<div class="boca-card">
        <span class="boca-num">Boca ${b}</span>
        <span class="boca-vazia">Vazia</span>
      </div>`);
    } else {
      // Um card por pallet dentro desta boca
      pallets.forEach(p => {
        const selecionado = palletSelecionadoId === p.id;
        const tempLocal = tempsLocais[p.id];
        const temTemp = tempLocal != null;
        const classes = ['boca-card', 'ocupada', selecionado ? 'selecionada' : '', temTemp ? 'com-temp' : ''].filter(Boolean).join(' ');
        cards.push(`<div class="${classes}" onclick="abrirDetalhe('${p.id}', ${b})">
          <span class="boca-num">Boca ${b}</span>
          <span class="boca-pallet">${p.id}</span>
          <span class="boca-var">${p.variedade || '—'}</span>
          <span class="boca-temp">${p.temp_entrada != null ? p.temp_entrada + '°C' : '—'}</span>
          ${temTemp ? `<span class="boca-temp-saida">Polpa: ${tempLocal.temp}°C ✓</span>` : ''}
        </div>`);
      });
    }
  }

  grid.innerHTML = cards.join('');
  atualizarConcluirBar();
}

/* ─── barra de concluir sessão ──────────────────────────────── */

function atualizarConcluirBar() {
  const bar = document.getElementById('concluir-bar');
  const btn = document.getElementById('btn-concluir-sessao');
  const info = document.getElementById('concluir-info');

  const todos = palletsDoTunel();
  if (!sessaoAtiva || todos.length === 0) {
    bar.style.display = 'none';
    return;
  }

  bar.style.display = 'flex';
  const comTemp = todos.filter(p => tempsLocais[p.id] != null).length;
  const total = todos.length;
  const completo = comTemp === total;

  info.innerHTML = completo
    ? `<span>${total}/${total}</span> pallets com temperatura registrada — pronto para concluir`
    : `<span>${comTemp}/${total}</span> pallets com temperatura registrada`;

  btn.disabled = !completo;
}

/* ─── barra de sessão ───────────────────────────────────────── */

async function renderSessaoBar() {
  const bar = document.getElementById('sessao-bar');
  const labelEl = document.getElementById('sessao-label');
  const infoEl = document.getElementById('sessao-info');

  if (!sessaoAtiva) {
    bar.style.display = 'none';
    return;
  }

  let remessa = 1;
  try {
    const todas = await api.get(`/resfriamento/sessoes?tunel=${tunelAtivo}`);
    const hoje = new Date().toISOString().slice(0, 10);
    remessa = todas.filter(s => s.iniciado_em && s.iniciado_em.startsWith(hoje)).length;
  } catch (_) {}

  const criada = sessaoAtiva.iniciado_em
    ? new Date(sessaoAtiva.iniciado_em).toLocaleString('pt-BR') : '—';
  const total = palletsDoTunel().length;

  labelEl.textContent = labelSessao(tunelAtivo, remessa);
  infoEl.textContent = `Criada em ${criada} · Pallets na sessão: ${total}`;
  bar.style.display = 'flex';
}

/* ─── tabela aguardando armazenamento ───────────────────────── */

async function renderAguardando() {
  const container = document.getElementById('aw-container');
  try {
    const pallets = await api.get('/armazenamento/aguardando');
    if (!pallets || pallets.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhum pallet aguardando armazenamento.</span>';
      return;
    }
    container.innerHTML = `
      <table class="aw-table">
        <thead>
          <tr>
            <th>N° Pallet</th><th>Variedade</th><th>Classif.</th><th>Produtor</th>
            <th>Túnel / Boca</th><th>Temp. entrada</th><th>Temp. polpa</th>
            <th>Registrado em</th><th>Ações</th>
          </tr>
        </thead>
        <tbody>
          ${pallets.map(p => `
            <tr>
              <td style="font-weight:600">${p.id}</td>
              <td>${p.variedade || '—'}</td>
              <td><span class="badge-${(p.classificacao||'').toLowerCase()==='good'?'good':'frutibras'}">${p.classificacao||'—'}</span></td>
              <td>${p.produtor||'—'}</td>
              <td>TÚNEL ${p.tunel||'—'} · Boca ${p.boca||'—'}</td>
              <td>${p.temp_entrada!=null?p.temp_entrada+'°C':'—'}</td>
              <td>${p.temp_saida!=null?p.temp_saida+'°C':'—'}</td>
              <td>${p.updated_at?new Date(p.updated_at).toLocaleString('pt-BR'):'—'}</td>
              <td><a href="armazenamento.html" class="btn btn-primary btn-sm">→ Armazenar</a></td>
            </tr>`).join('')}
        </tbody>
      </table>`;
  } catch (e) {
    container.innerHTML = `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

/* ─── seleção de túnel ──────────────────────────────────────── */

async function selectTunel(tunel) {
  tunelAtivo = tunel;
  palletSelecionadoId = null;
  tempsLocais = {};
  fecharDetalhe(false);

  document.getElementById('tab-t01').classList.toggle('active', tunel === '01');
  document.getElementById('tab-t02').classList.toggle('active', tunel === '02');
  document.getElementById('bocas-titulo').textContent = `Túnel ${tunel} — Bocas`;

  renderBocas();

  sessaoAtiva = null;
  try {
    const sessoes = await api.get(`/resfriamento/sessoes?tunel=${tunel}&status=ativa`);
    sessaoAtiva = Array.isArray(sessoes) && sessoes.length > 0 ? sessoes[0] : null;
  } catch (_) {}

  await renderSessaoBar();
  atualizarConcluirBar();
}

/* ─── detalhe do pallet ─────────────────────────────────────── */

function abrirDetalhe(palletId, boca) {
  const bocas = dadosTuneis[tunelAtivo] || {};
  const todos = Object.values(bocas).flat();
  const p = todos.find(x => x.id === palletId);
  if (!p) return;

  palletSelecionadoId = palletId;
  renderBocas();

  document.getElementById('d-boca-num').textContent = `Boca ${String(boca).padStart(2, '0')}`;
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

  // Preenche com valor já salvo localmente, se houver
  const local = tempsLocais[palletId];
  document.getElementById('input-temp-polpa').value = local ? local.temp : '';
  document.getElementById('input-obs').value = local ? local.obs : '';

  const panel = document.getElementById('detalhe-panel');
  panel.classList.add('ativo');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fecharDetalhe(rerender = true) {
  palletSelecionadoId = null;
  document.getElementById('detalhe-panel').classList.remove('ativo');
  if (rerender) renderBocas();
}

/* ─── salvar temperatura localmente ────────────────────────── */

document.getElementById('btn-salvar-temp').addEventListener('click', () => {
  if (!palletSelecionadoId) return;

  const tempVal = parseFloat(document.getElementById('input-temp-polpa').value);
  if (isNaN(tempVal)) {
    showToast('Informe a temperatura de polpa.', 'error');
    return;
  }

  const obs = document.getElementById('input-obs').value.trim();
  tempsLocais[palletSelecionadoId] = { temp: tempVal, obs: obs || null };

  showToast(`Temperatura de ${palletSelecionadoId} registrada. Salve os demais pallets para concluir a sessão.`, 'success');
  fecharDetalhe(true);
});

/* ─── concluir sessão em bloco ──────────────────────────────── */

async function concluirSessao() {
  if (!sessaoAtiva) return;

  const todos = palletsDoTunel();
  const semTemp = todos.filter(p => tempsLocais[p.id] == null);
  if (semTemp.length > 0) {
    showToast(`${semTemp.length} pallet(s) sem temperatura registrada.`, 'error');
    return;
  }

  // Usa a temperatura média dos pallets como temp_saida da sessão
  const temps = todos.map(p => tempsLocais[p.id].temp);
  const tempMedia = parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1));

  try {
    await api.post(`/resfriamento/sessao/${sessaoAtiva.id}/finalizar`, {
      temp_saida: tempMedia,
    });
    showToast('Sessão concluída! Todos os pallets movidos para armazenamento.', 'success');
    tempsLocais = {};
    sessaoAtiva = null;
    fecharDetalhe(false);
    await init();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

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
