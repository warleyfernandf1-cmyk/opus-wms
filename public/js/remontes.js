document.getElementById('btn-complementacao').addEventListener('click', async () => {
  const original = document.getElementById('comp-original').value.trim();
  const adicao   = document.getElementById('comp-adicao').value.trim();
  if (!original || !adicao) { showToast('Preencha os dois campos', 'error'); return; }
  try {
    const p = await api.post('/remontes/complementacao', { pallet_original_id: original, pallet_adicao_id: adicao });
    document.getElementById('result-comp').innerHTML =
      `<div style="color:var(--success)">✓ Pallet ${p.id} atualizado — ${p.qtd_caixas} caixas / ${p.peso}kg</div>`;
    showToast('Complementação realizada!', 'success');
  } catch(e) {
    showToast(e.message, 'error');
    document.getElementById('result-comp').innerHTML = `<div style="color:var(--danger)">${e.message}</div>`;
  }
});

document.getElementById('btn-juncao').addEventListener('click', async () => {
  const p1 = document.getElementById('junc-p1').value.trim();
  const p2 = document.getElementById('junc-p2').value.trim();
  if (!p1 || !p2) { showToast('Preencha os dois campos', 'error'); return; }
  try {
    const p = await api.post('/remontes/juncao', { pallet_id_1: p1, pallet_id_2: p2 });
    document.getElementById('result-junc').innerHTML =
      `<div style="color:var(--success)">✓ Novo pallet criado: "${p.id}" — ${p.qtd_caixas} caixas</div>`;
    showToast('Junção realizada!', 'success');
  } catch(e) {
    showToast(e.message, 'error');
    document.getElementById('result-junc').innerHTML = `<div style="color:var(--danger)">${e.message}</div>`;
  }
});
