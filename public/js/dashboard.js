async function loadKPIs() {
  try {
    const data = await api.get('/dashboard/kpis');
    const grid = document.getElementById('kpi-grid');
    const fases = data.pallets_por_fase || {};
    const pos   = data.posicoes || {};

    grid.innerHTML = `
      <div class="kpi accent"><div class="label">Total Pallets</div><div class="value">${data.total_pallets}</div></div>
      <div class="kpi"><div class="label">Recepção</div><div class="value">${fases.recepcao || 0}</div></div>
      <div class="kpi"><div class="label">Resfriamento</div><div class="value">${fases.resfriamento || 0}</div></div>
      <div class="kpi success"><div class="label">Armazenados</div><div class="value">${fases.armazenamento || 0}</div></div>
      <div class="kpi warning"><div class="label">Picking</div><div class="value">${fases.picking || 0}</div></div>
      <div class="kpi"><div class="label">Expedidos</div><div class="value">${fases.expedido || 0}</div></div>
      <div class="kpi"><div class="label">Posições Livres</div><div class="value">${pos.livres || 0}</div></div>
      <div class="kpi danger"><div class="label">Ocupação</div><div class="value">${pos.ocupacao_pct || 0}%</div></div>
    `;

    document.getElementById('fases-list').innerHTML = Object.entries(fases).map(([f,n]) =>
      `<div class="flex justify-between" style="padding:6px 0;border-bottom:1px solid var(--border)">
        <span>${faseBadge(f)}</span><strong>${n}</strong>
       </div>`
    ).join('') || '<span class="text-muted">Sem dados</span>';

    document.getElementById('posicoes-info').innerHTML = `
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div class="kpi" style="margin:0"><div class="label">Total</div><div class="value" style="font-size:1.2rem">${pos.total || 0}</div></div>
        <div class="kpi success" style="margin:0"><div class="label">Livres</div><div class="value" style="font-size:1.2rem">${pos.livres || 0}</div></div>
        <div class="kpi danger" style="margin:0"><div class="label">Ocupadas</div><div class="value" style="font-size:1.2rem">${pos.ocupadas || 0}</div></div>
        <div class="kpi warning" style="margin:0"><div class="label">Reservadas</div><div class="value" style="font-size:1.2rem">${pos.reservadas || 0}</div></div>
      </div>`;
  } catch(e) {
    showToast('Erro ao carregar KPIs: ' + e.message, 'error');
  }
}

loadKPIs();
setInterval(loadKPIs, 30000);
