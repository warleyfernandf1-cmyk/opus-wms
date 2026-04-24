const tbody   = document.getElementById('tbody-usuarios');
const modalEd = document.getElementById('modal-editar');
const modalSn = document.getElementById('modal-senha');

// Só admin acessa esta página — backend também bloqueia
const meuRole = sessionStorage.getItem('user_role');
if (meuRole !== 'admin') {
  window.location.href = 'index.html';
}

function roleBadge(role) {
  const map = {
    admin:      { label: 'Admin',      color: '#ef4444' },
    planejador: { label: 'Planejador', color: '#f59e0b' },
    operador:   { label: 'Operador',   color: '#6366f1' },
  };
  const r = map[role] || { label: role, color: '#94a3b8' };
  return `<span class="badge-status" style="background:${r.color}22;color:${r.color}">${r.label}</span>`;
}

async function carregar() {
  try {
    const lista = await api.get('/auth/usuarios');
    tbody.innerHTML = lista.map(u => `
      <tr>
        <td>${u.nome}</td>
        <td style="color:var(--muted)">${u.email}</td>
        <td>${roleBadge(u.role)}</td>
        <td>
          <span class="badge-status ${u.ativo ? 'badge-armazenamento' : 'badge-expedido'}">
            ${u.ativo ? 'Ativo' : 'Inativo'}
          </span>
        </td>
        <td style="color:var(--muted)">${u.ultimo_acesso ? fmtDate(u.ultimo_acesso) : '—'}</td>
        <td>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" onclick="abrirEditar('${u.id}','${u.nome.replace(/'/g,"\\'")}','${u.role}')">Editar</button>
            <button class="btn btn-ghost btn-sm" onclick="abrirSenha('${u.id}')">Senha</button>
            ${u.ativo
              ? `<button class="btn btn-danger btn-sm" onclick="desativar('${u.id}')">Desativar</button>`
              : `<button class="btn btn-success btn-sm" onclick="reativar('${u.id}')">Reativar</button>`
            }
          </div>
        </td>
      </tr>
    `).join('') || '<tr><td colspan="6" class="text-muted">Nenhum usuário.</td></tr>';
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-muted">Erro ao carregar.</td></tr>`;
  }
}

document.getElementById('btn-refresh').addEventListener('click', carregar);

document.getElementById('btn-criar').addEventListener('click', async () => {
  const nome  = document.getElementById('u-nome').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const role  = document.getElementById('u-role').value;
  const senha = document.getElementById('u-senha').value;

  if (!nome || !email || !senha) return showToast('Preencha todos os campos.', 'error');
  if (senha.length < 8) return showToast('Senha deve ter ao menos 8 caracteres.', 'error');

  try {
    await api.post('/auth/usuarios', { nome, email, senha, role });
    showToast('Usuário criado com sucesso.', 'success');
    ['u-nome','u-email','u-senha'].forEach(id => document.getElementById(id).value = '');
    carregar();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

function abrirEditar(id, nome, role) {
  document.getElementById('edit-id').value   = id;
  document.getElementById('edit-nome').value = nome;
  document.getElementById('edit-role').value = role;
  modalEd.style.display = 'flex';
}

function fecharModal() { modalEd.style.display = 'none'; }

document.getElementById('btn-salvar-edicao').addEventListener('click', async () => {
  const id   = document.getElementById('edit-id').value;
  const nome = document.getElementById('edit-nome').value.trim();
  const role = document.getElementById('edit-role').value;

  try {
    await api.put(`/auth/usuarios/${id}`, { nome, role });
    showToast('Usuário atualizado.', 'success');
    fecharModal();
    carregar();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

function abrirSenha(id) {
  document.getElementById('senha-user-id').value = id;
  document.getElementById('nova-senha').value = '';
  modalSn.style.display = 'flex';
}

function fecharModalSenha() { modalSn.style.display = 'none'; }

document.getElementById('btn-salvar-senha').addEventListener('click', async () => {
  const id    = document.getElementById('senha-user-id').value;
  const senha = document.getElementById('nova-senha').value;

  if (senha.length < 8) return showToast('Senha deve ter ao menos 8 caracteres.', 'error');

  try {
    await api.post(`/auth/usuarios/${id}/redefinir-senha`, { nova_senha: senha });
    showToast('Senha redefinida com sucesso.', 'success');
    fecharModalSenha();
  } catch (e) {
    showToast(e.message, 'error');
  }
});

async function desativar(id) {
  if (!confirm('Desativar este usuário?')) return;
  try {
    await api.post(`/auth/usuarios/${id}/desativar`, {});
    showToast('Usuário desativado.', 'success');
    carregar();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

async function reativar(id) {
  try {
    await api.post(`/auth/usuarios/${id}/reativar`, {});
    showToast('Usuário reativado.', 'success');
    carregar();
  } catch (e) {
    showToast(e.message, 'error');
  }
}

carregar();
