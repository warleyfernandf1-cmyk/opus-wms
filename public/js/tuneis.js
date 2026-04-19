async function loadTuneis() {
  try {
    const data = await api.get('/tuneis/');
    const layout = data.layout;

    ['01','02'].forEach(t => {
      const el = document.getElementById(`map-t${t}`);
      const bocas = data.tuneis[t] || {};

      const renderColuna = (nums) =>
        nums.map(b => {
          const pallets = bocas[String(b)] || [];
          return `<div class="boca-card ${pallets.length?'ocupada':'vazia'}">
            <div class="boca-num">Boca ${b}</div>
            ${pallets.map(p=>`<div style="font-size:.7rem;color:var(--text)">${p.id} — ${p.variedade || ''}</div>`).join('')}
            ${!pallets.length ? '<div style="font-size:.65rem;color:var(--muted)">Vazia</div>' : ''}
          </div>`;
        }).join('');

      el.innerHTML = `
        <div class="tunel-grid">
          <div class="tunel-coluna">${renderColuna(layout.direita)}</div>
          <div class="tunel-corredor">
            <div style="font-size:.65rem;color:var(--muted);writing-mode:vertical-lr;text-orientation:mixed">CORREDOR</div>
          </div>
          <div class="tunel-coluna">${renderColuna(layout.esquerda)}</div>
        </div>`;
    });
  } catch(e) { showToast(e.message, 'error'); }
}

loadTuneis();
setInterval(loadTuneis, 15000);
