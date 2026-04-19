async function loadOEs() {
  try {
    const oes = await api.get('/expedicao/ordens');
    const tbody = document.getElementById('tbody-oes');
    if (!oes.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Nenhuma OE.</td></tr>'; return; }
    tbody.innerHTML = oes.map(oe => `
      <tr>
        <td><strong>${oe.id}</strong></td>
        <td>${(oe.pallet_ids||[]).join(', ')}</td>
        <td>${statusBadge(oe.status)}</td>
        <td>${fmtDate(oe.criada_em)}</td>
        <td>${oe.status==='pendente'?`<button class="btn btn-success btn-sm" onclick="executarOE('${oe.id}')">Expedir</button>`:'—'}</td>
      </tr>`).join('');
  } catch(e) { showToast(e.message, 'error'); }
}

async function executarOE(id) {
  if (!confirm(`Expedir OE ${id}?`)) return;
  try { await api.post(`/expedicao/ordens/${id}/executar`); showToast('OE executada!', 'success'); loadOEs(); }
  catch(e) { showToast(e.message, 'error'); }
}

document.getElementById('btn-criar-oe').addEventListener('click', async () => {
  const ids = document.getElementById('exp-pallets').value.split(',').map(s=>s.trim()).filter(Boolean);
  if (!ids.length) { showToast('Informe ao menos um pallet', 'error'); return; }
  try {
    const oe = await api.post('/expedicao/ordem', { pallet_ids: ids });
    showToast(`OE ${oe.id} criada!`, 'success');
    document.getElementById('exp-pallets').value = '';
    loadOEs();
  } catch(e) { showToast(e.message, 'error'); }
});

document.getElementById('btn-refresh').addEventListener('click', loadOEs);
loadOEs();
