/**
 * resfriamento.js
 *
 * Regras:
 * - Fonte da verdade: banco de dados. temp_saida já salva no pallet = temperatura registrada.
 * - Ao carregar a página, lê temp_saida de cada pallet do banco (sem perda por refresh).
 * - Salvar temperatura: persiste imediatamente via POST /resfriamento/pallet/{id}/temp.
 * - Concluir sessão: só habilita quando todos os pallets têm temp_saida != null no banco.
 * - Ao concluir: chama finalizar_sessao que move todos atomicamente e gera OA.
 * - OAs listadas na seção inferior com pallets vinculados.
 */

/* ─── estado global ─────────────────────────────────────────── */
let tunelAtivo = '01';
let palletSelecionadoId = null;
let dadosTuneis = {};
let sessaoAtiva = null;

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

/* ─── renderização das bocas ────────────────────────────────── */

function renderBocas() {
  const grid = document.getElementById('bocas-grid');
  const bocas = dadosTuneis[tunelAtivo] || {};

  const cards = [];
  for (let b = 1; b <= 12; b++) {
    const pallets = bocas[String(b)] || [];
    if (pallets.length === 0) {
      cards.push(`<div class="boca-card">
        <span class="boca-num">Boca ${b}</span>
        <span class="boca-vazia">Vazia</span>
      </div>`);
    } else {
      pallets.forEach(p => {
        const selecionado = palletSelecionadoId === p.id;
        // temp_saida já salvo no banco = temperatura registrada (fonte da verdade)
        const temTemp = p.temp_saida != null;
        const classes = ['boca-card', 'ocupada',
          selecionado ? 'selecionada' : '',
          temTemp ? 'com-temp' : ''
        ].filter(Boolean).join(' ');

        cards.push(`<div class="${classes}" onclick="abrirDetalhe('${p.id}', ${b})">
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
  // Fonte da verdade: temp_saida no banco
  const comTemp = todos.filter(p => p.temp_saida != null).length;
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
    // Apenas pallets com temperatura registrada (temp_saida != null) e sem câmara
    const pallets = await api.get('/armazenamento/aguardando');
    const comTemp = (pallets || []).filter(p => p.temp_saida != null);

    if (comTemp.length === 0) {
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
          ${comTemp.map(p => `
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

/* ─── ordens de armazenamento ───────────────────────────────── */

async function renderOAs() {
  const container = document.getElementById('oas-container');
  try {
    const oas = await api.get(`/resfriamento/oas?tunel=${tunelAtivo}`);
    if (!oas || oas.length === 0) {
      container.innerHTML = '<span style="color:var(--text-muted);font-size:.82rem">Nenhuma OA gerada para este túnel.</span>';
      return;
    }

    container.innerHTML = oas.map(oa => {
      const pallets = (oa.dados?.pallets || []);
      const criada = oa.criada_em ? new Date(oa.criada_em).toLocaleString('pt-BR') : '—';
      return `
        <div class="oa-card">
          <div class="oa-header">
            <span class="oa-id">${oa.id}</span>
            <span class="oa-status pendente">${oa.status || 'pendente'}</span>
          </div>
          <div class="oa-meta">Criada em ${criada} · ${pallets.length} pallet(s)</div>
          <div style="font-size:.78rem;color:var(--text-muted)">
            Pallets: ${pallets.length > 0 ? pallets.join(', ') : '—'}
          </div>
        </div>`;
    }).join('');
  } catch (e) {
    container.innerHTML = `<span style="color:var(--danger);font-size:.82rem">Erro: ${e.message}</span>`;
  }
}

/* ─── seleção de túnel ──────────────────────────────────────── */

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
    const sessoes = await api.get(`/resfriamento/sessoes?tunel=${tunel}&status=ativa`);
    sessaoAtiva = Array.isArray(sessoes) && sessoes.length > 0 ? sessoes[0] : null;
  } catch (_) {}

  await renderSessaoBar();
  atualizarConcluirBar();
  await renderOAs();
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

  // Preenche com valor já salvo no banco (fonte da verdade)
  document.getElementById('input-temp-polpa').value = p.temp_saida != null ? p.temp_saida : '';
  document.getElementById('input-obs').value = '';

  const panel = document.getElementById('detalhe-panel');
  panel.classList.add('ativo');
  panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function fecharDetalhe(rerender = true) {
  palletSelecionadoId = null;
  document.getElementById('detalhe-panel').classList.remove('ativo');
  if (rerender) renderBocas();
}

/* ─── salvar temperatura — persiste imediatamente no banco ──── */

document.getElementById('btn-salvar-temp').addEventListener('click', async () => {
  if (!palletSelecionadoId) return;

  const tempVal = parseFloat(document.getElementById('input-temp-polpa').value);
  if (isNaN(tempVal)) {
    showToast('Informe a temperatura de polpa.', 'error');
    return;
  }

  const obs = document.getElementById('input-obs').value.trim();

  try {
    // Persiste imediatamente no banco — não perde com refresh
    await api.post(`/resfriamento/pallet/${palletSelecionadoId}/temp`, {
      temp_polpa: tempVal,
      observacao: obs || null,
      sessao_id: sessaoAtiva ? sessaoAtiva.id : null,
    });

    // Atualiza o estado local refletindo o banco
    const bocas = dadosTuneis[tunelAtivo] || {};
    Object.values(bocas).flat().forEach(p => {
      if (p.id === palletSelecionadoId) p.temp_saida = tempVal;
    });

    showToast(`Temperatura do pallet ${palletSelecionadoId} salva.`, 'success');
    fecharDetalhe(true);
  } catch (e) {
    showToast(e.message, 'error');
  }
});

/* ─── concluir sessão em bloco ──────────────────────────────── */

async function concluirSessao() {
  if (!sessaoAtiva) return;

  const todos = palletsDoTunel();
  const semTemp = todos.filter(p => p.temp_saida == null);
  if (semTemp.length > 0) {
    showToast(`${semTemp.length} pallet(s) sem temperatura registrada.`, 'error');
    return;
  }

  // Temperatura da sessão = média das temperaturas de polpa
  const temps = todos.map(p => p.temp_saida);
  const tempMedia = parseFloat((temps.reduce((a, b) => a + b, 0) / temps.length).toFixed(1));

  try {
    await api.post(`/resfriamento/sessao/${sessaoAtiva.id}/finalizar`, {
      temp_saida: tempMedia,
    });
    showToast('Sessão concluída! Todos os pallets movidos para armazenamento.', 'success');
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
