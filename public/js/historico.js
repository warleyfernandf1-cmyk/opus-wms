async function loadHistorico() {
  const filtro = document.getElementById('filtro-pallet').value.trim();
  try {
    const path = filtro ? `/historico/pallet/${encodeURIComponent(filtro)}` : '/historico/';
    const list = await api.get(path);
    const tbody = document.getElementById('tbody-historico');
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Nenhum registro.</td></tr>'; return; }
    tbody.innerHTML = list.map(h => `
      <tr>
        <td class="text-sm">${fmtDate(h.created_at)}</td>
        <td>${h.pallet_id || '—'}</td>
        <td><code style="font-size:.75rem;color:var(--accent)">${h.acao}</code></td>
        <td>${h.fase_anterior ? faseBadge(h.fase_anterior) : '—'}</td>
        <td>${h.fase_nova    ? faseBadge(h.fase_nova)    : '—'}</td>
        <td><span class="text-muted text-sm">${h.dados ? JSON.stringify(h.dados).slice(0,60)+'…' : '—'}</span></td>
      </tr>`).join('');
  } catch(e) { showToast(e.message, 'error'); }
}

document.getElementById('btn-refresh').addEventListener('click', loadHistorico);
document.getElementById('filtro-pallet').addEventListener('keyup', e => { if(e.key==='Enter') loadHistorico(); });
loadHistorico();
