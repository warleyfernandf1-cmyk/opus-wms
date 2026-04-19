async function renderCamara(id) {
  document.getElementById('camara-titulo').textContent = `Câmara ${id}`;
  const map = document.getElementById('camara-map');
  map.innerHTML = '<span class="text-muted">Carregando...</span>';

  try {
    const data = await api.get(`/camaras/${id}`);
    const posicoes = data.posicoes || [];
    const ruas = {};
    const corredor = [];

    for (const p of posicoes) {
      if (p.tipo === 'rua') {
        ruas[p.rua] = ruas[p.rua] || [];
        ruas[p.rua].push(p);
      } else {
        corredor.push(p);
      }
    }

    let html = '<div style="display:flex;flex-direction:column;gap:4px">';

    // Ruas 1-13
    for (let r = 1; r <= 13; r++) {
      const cells = (ruas[r] || []).sort((a,b)=>a.posicao-b.posicao);
      html += `<div style="display:flex;align-items:center;gap:4px">
        <span style="width:40px;font-size:.65rem;color:var(--muted);text-align:right">R${String(r).padStart(2,'0')}</span>`;
      for (const c of cells) {
        const cls = c.is_gap ? 'gap' : c.status === 'ocupada' ? 'ocupada' : c.status.startsWith('reservada') ? 'reservada' : 'livre';
        const title = c.pallet_id ? `Pallet: ${c.pallet_id}` : c.id;
        html += `<div class="pos-cell ${cls}" title="${title}">${c.pallet_id ? c.pallet_id.slice(0,4) : ''}</div>`;
      }
      html += '</div>';
    }

    // Corredor
    html += `<div style="display:flex;align-items:center;gap:4px;margin-top:8px;border-top:1px solid var(--border);padding-top:8px">
      <span style="width:40px;font-size:.65rem;color:var(--muted);text-align:right">COR</span>`;
    const corSorted = corredor.sort((a,b)=>a.posicao-b.posicao);
    for (const c of corSorted) {
      const cls = c.is_gap ? 'gap' : c.status === 'ocupada' ? 'ocupada' : c.status.startsWith('reservada') ? 'reservada' : 'livre';
      html += `<div class="pos-cell ${cls}" title="${c.is_gap ? 'PORTA' : c.id}">${c.is_gap ? '🚪' : ''}</div>`;
    }
    html += '</div></div>';

    map.innerHTML = html;

    const livre = posicoes.filter(p=>!p.is_gap && p.status==='livre').length;
    const total = posicoes.filter(p=>!p.is_gap).length;
    document.getElementById('camara-legenda').textContent =
      `Câmara ${id} — ${livre} livres de ${total} posições (${Math.round(livre/total*100)}% disponível)`;
  } catch(e) {
    map.innerHTML = `<span style="color:var(--danger)">${e.message}</span>`;
  }
}

renderCamara('01');
