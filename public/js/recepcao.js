async function loadPallets() {
  try {
    const pallets = await api.get('/recepcao/');
    const tbody = document.getElementById('tbody-recepcao');
    if (!pallets.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-muted">Nenhum pallet em recepção.</td></tr>'; return; }
    tbody.innerHTML = pallets.map(p => `
      <tr>
        <td><strong>${p.id}</strong>${p.is_adicao ? ' <span class="badge-status badge-warning" style="font-size:.65rem">ADIÇÃO</span>' : ''}</td>
        <td>${p.variedade}</td>
        <td>${p.qtd_caixas}</td>
        <td>${p.produtor}</td>
        <td>T${p.tunel}</td>
        <td>${p.boca}</td>
        <td>${p.temp_entrada}°C</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="rollback('${p.id}')">Rollback</button>
        </td>
      </tr>`).join('');
  } catch(e) {
    showToast('Erro ao carregar pallets: ' + e.message, 'error');
  }
}

async function rollback(id) {
  if (!confirm(`Excluir permanentemente o pallet ${id}?`)) return;
  try {
    await api.delete(`/recepcao/${encodeURIComponent(id)}/rollback`);
    showToast(`Pallet ${id} excluído.`, 'success');
    loadPallets();
  } catch(e) {
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
  } catch(e) {
    showToast(e.message, 'error');
  }
});

document.getElementById('btn-refresh').addEventListener('click', loadPallets);
loadPallets();
