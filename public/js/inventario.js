let invAtivo = null;

async function loadInventarios() {
  try {
    const list = await api.get('/inventario/');
    const tbody = document.getElementById('tbody-inventarios');
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="5" class="text-muted">Nenhum inventário.</td></tr>'; return; }

    invAtivo = list.find(i => i.status === 'em_andamento') || null;
    const card = document.getElementById('inv-ativo');
    if (invAtivo) {
      card.style.display = 'block';
      document.getElementById('inv-id-display').textContent = `ID: ${invAtivo.id}`;
    } else {
      card.style.display = 'none';
    }

    tbody.innerHTML = list.map(i => `
      <tr>
        <td>${i.id.slice(0,8)}…</td>
        <td>${statusBadge(i.status)}</td>
        <td>${i.acuracidade != null ? i.acuracidade + '%' : '—'}</td>
        <td>${fmtDate(i.iniciado_em)}</td>
        <td>${fmtDate(i.finalizado_em)}</td>
      </tr>`).join('');
  } catch(e) { showToast(e.message, 'error'); }
}

document.getElementById('btn-iniciar').addEventListener('click', async () => {
  try { await api.post('/inventario/iniciar'); showToast('Inventário iniciado!', 'success'); loadInventarios(); }
  catch(e) { showToast(e.message, 'error'); }
});

document.getElementById('btn-registrar-item').addEventListener('click', async () => {
  if (!invAtivo) return;
  const pid = document.getElementById('reg-pallet').value.trim();
  const qtd = Number(document.getElementById('reg-qtd').value);
  try {
    await api.post(`/inventario/${invAtivo.id}/registrar`, { pallet_id: pid, qtd_contada: qtd });
    showToast(`Pallet ${pid} registrado.`, 'success');
  } catch(e) { showToast(e.message, 'error'); }
});

document.getElementById('btn-finalizar').addEventListener('click', async () => {
  if (!invAtivo || !confirm('Finalizar inventário?')) return;
  try {
    const r = await api.post(`/inventario/${invAtivo.id}/finalizar`);
    showToast(`Inventário finalizado. Acuracidade: ${r.acuracidade}%`, 'success');
    loadInventarios();
  } catch(e) { showToast(e.message, 'error'); }
});

document.getElementById('btn-refresh').addEventListener('click', loadInventarios);
loadInventarios();
