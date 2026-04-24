"""
Bootstrap: cria o primeiro usuário admin do sistema.
Execute uma única vez, localmente.

Dependências: apenas bcrypt (pip install bcrypt)
As credenciais são lidas do arquivo .env na raiz do projeto.

Uso interativo:
    python scripts/criar_admin.py

Uso via argumentos (sem prompts):
    python scripts/criar_admin.py --email admin@empresa.com --nome "Seu Nome" --senha SuaSenha123
"""
import sys
import os
import argparse
import json
import urllib.request
import urllib.error

# ── Lê .env manualmente (sem depender de python-dotenv) ───────────────────────
def _load_env():
    env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ".env")
    if not os.path.exists(env_path):
        print(f"Erro: arquivo .env não encontrado em {env_path}")
        sys.exit(1)
    with open(env_path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

_load_env()

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

if not SUPABASE_URL or not SUPABASE_KEY:
    print("Erro: SUPABASE_URL ou SUPABASE_SERVICE_KEY não definidos no .env")
    sys.exit(1)


# ── HTTP helpers (sem SDK) ─────────────────────────────────────────────────────
def _supabase_get(path):
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}"},
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read().decode())


def _supabase_post(path, body):
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{SUPABASE_URL}/rest/v1/{path}",
        data=data,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return r.status


# ── bcrypt (única dependência real) ───────────────────────────────────────────
try:
    import bcrypt
except ImportError:
    print("Erro: bcrypt não instalado. Execute: pip install bcrypt")
    sys.exit(1)


def hash_senha(senha: str) -> str:
    return bcrypt.hashpw(senha.encode(), bcrypt.gensalt(rounds=12)).decode()


# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Criar primeiro admin do Opus WMS")
    parser.add_argument("--email", help="E-mail do admin")
    parser.add_argument("--nome",  help="Nome completo do admin")
    parser.add_argument("--senha", help="Senha (mín. 8 caracteres)")
    args = parser.parse_args()

    if args.email and args.nome and args.senha:
        email = args.email.strip()
        nome  = args.nome.strip()
        senha = args.senha
    else:
        print("=== Opus WMS — Criar Admin ===\n")
        email = (args.email or input("E-mail: ")).strip()
        if not email:
            print("E-mail não pode ser vazio.")
            sys.exit(1)
        nome = (args.nome or input("Nome completo: ")).strip()
        if not nome:
            print("Nome não pode ser vazio.")
            sys.exit(1)
        if args.senha:
            senha = args.senha
        else:
            import getpass
            senha    = getpass.getpass("Senha (mín. 8 chars): ")
            confirma = getpass.getpass("Confirmar senha: ")
            if senha != confirma:
                print("As senhas não coincidem.")
                sys.exit(1)

    if len(senha) < 8:
        print("Senha muito curta (mínimo 8 caracteres).")
        sys.exit(1)

    # Verifica duplicata
    try:
        rows = _supabase_get(f"usuarios?select=id&email=eq.{urllib.parse.quote(email)}")
    except urllib.error.HTTPError as e:
        print(f"Erro ao consultar banco: {e.code} {e.read().decode()}")
        sys.exit(1)

    if rows:
        print(f"Erro: já existe um usuário com o e-mail '{email}'.")
        sys.exit(1)

    # Cria admin
    try:
        _supabase_post("usuarios", {
            "email":      email,
            "senha_hash": hash_senha(senha),
            "nome":       nome,
            "role":       "admin",
            "ativo":      True,
        })
    except urllib.error.HTTPError as e:
        print(f"Erro ao criar usuário: {e.code} {e.read().decode()}")
        sys.exit(1)

    print(f"\nAdmin '{nome}' ({email}) criado com sucesso!")
    print("Acesse: https://opus-wms.vercel.app")


import urllib.parse
if __name__ == "__main__":
    main()
