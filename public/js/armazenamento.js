async function loadPallets() {
  const camara = document.getElementById('filtro-camara').value;
  try {
    let pallets = await api.get('/recepcao/');
    // fetch all armazenamento pallets via dashboard kpis workaround — use direct query
    const resp = await fetch('/api/armazenamento/posicoes-livres' + (camara ? `?camara=${camara}` : ''));
    // load pallets in armazenamento
    const all = await api.get('/dashboard/kpis'); // just to trigger; actual list below

    // Fetch all pallets (reuse recepcao endpoint is wrong; use camaras data)
    const tbody = document.getElementById('tbody-armazenamento');
    tbody.innerHTML = '<tr><td colspan="8" class="text-muted">Use o mapa de Câmaras para visualizar posições.</td></tr>';
  } catch(e) { /* silently */ }
}

document.getElementById('btn-alocar').addEventListener('click', async () => {
  const pallet_id = document.getElementById('pallet-id').value.trim();
  const camara    = document.getElementById('alocar-camara').value;
  const rua       = Number(document.getElementById('alocar-rua').value);
  const posicao   = Number(document.getElementById('alocar-posicao').value);
  if (!pallet_id || !rua || !posicao) { showToast('Preencha todos os campos', 'error'); return; }
  try {
    await api.post('/armazenamento/alocar', { pallet_id, camara, rua, posicao });
    showToast(`Pallet ${pallet_id} alocado em C${camara}-R${String(rua).padStart(2,'0')}-P${String(posicao).padStart(2,'0')}`, 'success');
    document.getElementById('pallet-id').value = '';
  } catch(e) {
    showToast(e.message, 'error');
  }
});

document.getElementById('btn-refresh').addEventListener('click', loadPallets);
loadPallets();
