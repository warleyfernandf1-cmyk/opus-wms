async function loadTuneis() {
  try {
    const data = await api.get('/resfriamento/tuneis');
    ['01','02'].forEach(t => {
      const el = document.getElementById(`bocas-t${t}`);
      const bocas = data[t] || {};
      const hasData = Object.keys(bocas).length > 0;
      el.innerHTML = hasData
        ? `<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:6px">` +
          Array.from({length:12},(_,i)=>i+1).map(b => {
            const pallets = bocas[String(b)] || [];
            return `<div class="boca-card ${pallets.length?'ocupada':'vazia'}">
              <div class="boca-num">Boca ${b}</div>
              ${pallets.map(p=>`<div style="font-size:.7rem">${p.id}</div>`).join('')}
            </div>`;
          }).join('') + `</div>`
        : '<span class="text-muted text-sm">Túnel vazio</span>';

      const acaoEl = document.getElementById(`acao-t${t}`);
      acaoEl.innerHTML = `<button class="btn btn-primary btn-sm" onclick="iniciarSessao('${t}')">+ Iniciar Sessão</button>`;
    });
  } catch(e) {
    showToast('Erro ao carregar túneis: ' + e.message, 'error');
  }
}

async function iniciarSessao(tunel) {
  try {
    const s = await api.post('/resfriamento/sessao', { tunel });
    showToast(`Sessão ${s.id} iniciada no Túnel ${tunel}`, 'success');
    document.getElementById('sessao-id').value = s.id;
    loadTuneis();
  } catch(e) {
    showToast(e.message, 'error');
  }
}

document.getElementById('btn-finalizar').addEventListener('click', async () => {
  const id = document.getElementById('sessao-id').value.trim();
  const temp = Number(document.getElementById('temp-saida').value);
  if (!id || !temp) { showToast('Preencha Sessão ID e Temperatura de Saída', 'error'); return; }
  try {
    await api.post(`/resfriamento/sessao/${id}/finalizar`, { temp_saida: temp });
    showToast(`Sessão finalizada. Pallets movidos para Armazenamento.`, 'success');
    loadTuneis();
  } catch(e) {
    showToast(e.message, 'error');
  }
});

loadTuneis();
