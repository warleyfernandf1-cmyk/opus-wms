async function loadOPs() {
  try {
    const ops = await api.get('/picking/ordens');
    const tbody = document.getElementById('tbody-ops');
    if (!ops.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Nenhuma OP.</td></tr>'; return; }
    tbody.innerHTML = ops.map(op => `
      <tr>
        <td><strong>${op.id}</strong></td>
        <td>${(op.pallet_ids||[]).join(', ')}</td>
        <td>${statusBadge(op.status)}</td>
        <td>${fmtDate(op.criada_em)}</td>
        <td class="flex gap-2">
          ${op.status==='pendente'?`
            <button class="btn btn-success btn-sm" onclick="executarOP('${op.id}')">Executar</button>
            <button class="btn btn-danger btn-sm" onclick="cancelarOP('${op.id}')">Cancelar</button>
          `:'—'}
        </td>
      </tr>`).join('');
  } catch(e) { showToast(e.message, 'error'); }
}

async function executarOP(id) {
  if (!confirm(`Executar OP ${id}?`)) return;
  try { await api.post(`/picking/ordens/${id}/executar`); showToast('OP executada!', 'success'); loadOPs(); }
  catch(e) { showToast(e.message, 'error'); }
}

async function cancelarOP(id) {
  if (!confirm(`Cancelar OP ${id} e liberar posições?`)) return;
  try { await api.post(`/picking/ordens/${id}/cancelar`); showToast('OP cancelada.', 'info'); loadOPs(); }
  catch(e) { showToast(e.message, 'error'); }
}

document.getElementById('btn-criar-op').addEventListener('click', async () => {
  const raw = document.getElementById('picking-pallets').value;
  const obs = document.getElementById('picking-obs').value;
  const ids = raw.split(',').map(s=>s.trim()).filter(Boolean);
  if (!ids.length) { showToast('Informe ao menos um pallet', 'error'); return; }
  try {
    const op = await api.post('/picking/ordem', { pallet_ids: ids, observacoes: obs || null });
    showToast(`OP ${op.id} criada! Posições reservadas.`, 'success');
    document.getElementById('picking-pallets').value = '';
    loadOPs();
  } catch(e) { showToast(e.message, 'error'); }
});

document.getElementById('btn-refresh').addEventListener('click', loadOPs);
loadOPs();
