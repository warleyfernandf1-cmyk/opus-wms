async function loadRelatorios() {
  const modulo = document.getElementById('filtro-modulo').value;
  try {
    const list = await api.get('/relatorios/' + (modulo ? `?modulo=${modulo}` : ''));
    const tbody = document.getElementById('tbody-relatorios');
    if (!list.length) { tbody.innerHTML = '<tr><td colspan="6" class="text-muted">Nenhum relatório.</td></tr>'; return; }
    tbody.innerHTML = list.map(r => `
      <tr>
        <td><span class="badge-status badge-${r.modulo}">${r.modulo}</span></td>
        <td>${r.titulo}</td>
        <td>${fmtDate(r.inicio_execucao)}</td>
        <td>${fmtDate(r.fim_execucao)}</td>
        <td>${r.tempo_medio_s ? r.tempo_medio_s + 's' : '—'}</td>
        <td><button class="btn btn-ghost btn-sm" onclick='showDados(${JSON.stringify(r.dados)})'>Ver Dados</button></td>
      </tr>`).join('');
  } catch(e) { showToast(e.message, 'error'); }
}

function showDados(dados) {
  alert(JSON.stringify(dados, null, 2));
}

document.getElementById('btn-refresh').addEventListener('click', loadRelatorios);
document.getElementById('filtro-modulo').addEventListener('change', loadRelatorios);
loadRelatorios();
