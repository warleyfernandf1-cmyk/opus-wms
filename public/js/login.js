// Redireciona se já estiver logado
if (sessionStorage.getItem('token')) {
  window.location.href = 'index.html';
}

const btnLogin  = document.getElementById('btn-login');
const emailEl   = document.getElementById('email');
const senhaEl   = document.getElementById('senha');
const errorEl   = document.getElementById('login-error');

function mostrarErro(msg) {
  errorEl.textContent = msg;
  errorEl.style.display = 'block';
}

function esconderErro() {
  errorEl.style.display = 'none';
}

async function fazerLogin() {
  esconderErro();
  const email = emailEl.value.trim();
  const senha = senhaEl.value;

  if (!email || !senha) {
    mostrarErro('Preencha e-mail e senha.');
    return;
  }

  btnLogin.disabled = true;
  btnLogin.textContent = 'Entrando...';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha }),
    });

    const data = await res.json();

    if (!res.ok) {
      mostrarErro(data.detail || 'Credenciais inválidas.');
      return;
    }

    sessionStorage.setItem('token', data.access_token);

    // Decodifica payload do JWT para exibição (sem verificar assinatura — só display)
    try {
      const payload = JSON.parse(atob(data.access_token.split('.')[1]));
      sessionStorage.setItem('user_nome', payload.nome || '');
      sessionStorage.setItem('user_role', payload.role || '');
    } catch (_) {}

    window.location.href = 'index.html';

  } catch (err) {
    mostrarErro('Erro de conexão. Tente novamente.');
  } finally {
    btnLogin.disabled = false;
    btnLogin.textContent = 'Entrar';
  }
}

btnLogin.addEventListener('click', fazerLogin);

// Permite Enter nos campos
[emailEl, senhaEl].forEach(el => {
  el.addEventListener('keydown', e => { if (e.key === 'Enter') fazerLogin(); });
});
