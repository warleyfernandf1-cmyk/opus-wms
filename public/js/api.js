const BASE = '/api';

// ── Auth guard — redireciona para login se não autenticado ──
(function authGuard() {
  if (location.pathname.endsWith('login.html')) return;
  if (!sessionStorage.getItem('token')) {
    window.location.href = 'login.html';
  }
})();

// ── Logout ──────────────────────────────────────────────────
function logout() {
  sessionStorage.clear();
  window.location.href = 'login.html';
}

// ── Requisição base ─────────────────────────────────────────
async function request(method, path, body) {
  const token = sessionStorage.getItem('token');
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    },
  };
  if (body !== undefined) opts.body = JSON.stringify(body);

  const res = await fetch(BASE + path, opts);

  // Sessão expirada ou token inválido → força novo login
  if (res.status === 401) {
    sessionStorage.clear();
    window.location.href = 'login.html';
    return;
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || 'Erro desconhecido');
  }

  if (res.status === 204) return null;
  return res.json();
}

const api = {
  get:    (path)        => request('GET',    path),
  post:   (path, body)  => request('POST',   path, body),
  delete: (path)        => request('DELETE', path),
  put:    (path, body)  => request('PUT',    path, body),
};

// ── Sidebar: usuário logado + controle de visibilidade admin ─
document.addEventListener('DOMContentLoaded', () => {
  // Link ativo na nav
  const page = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('nav a').forEach(a => {
    if (a.getAttribute('href') === page) a.classList.add('active');
  });

  // Dados do usuário (decodificados do JWT — só para exibição)
  const nome = sessionStorage.getItem('user_nome') || '';
  const role = sessionStorage.getItem('user_role') || '';

  const elNome = document.getElementById('sidebar-nome');
  const elRole = document.getElementById('sidebar-role');
  if (elNome) elNome.textContent = nome || '—';
  if (elRole) {
    const labels = { admin: 'Admin', planejador: 'Planejador', operador: 'Operador' };
    elRole.textContent = labels[role] || role;
  }

  // Exibe link de Usuários e label Admin apenas para admin
  if (role === 'admin') {
    const linkUsuarios = document.getElementById('link-usuarios');
    const labelAdmin   = document.getElementById('label-admin');
    if (linkUsuarios) linkUsuarios.style.display = 'flex';
    if (labelAdmin)   labelAdmin.style.display   = 'block';
  }
});

// ── Toast notifications ──────────────────────────────────────
function showToast(msg, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// ── Helpers ──────────────────────────────────────────────────
function faseBadge(fase) {
  return `<span class="badge-status badge-${fase}">${fase}</span>`;
}

function statusBadge(status) {
  const map = { livre: 'livre', ocupada: 'ocupada', reservada_oa: 'reservada', reservada_picking: 'reservada' };
  return `<span class="badge-status badge-${map[status] || ''}">${status}</span>`;
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleString('pt-BR');
}
