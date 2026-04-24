"""
Setup completo do Opus WMS — execute UMA vez antes do primeiro deploy.

O que este script faz:
  1. Conecta diretamente ao PostgreSQL do Supabase
  2. Cria as tabelas usuarios e tentativas_login
  3. Cria o primeiro usuário administrador

Pré-requisitos:
  - pip install psycopg2-binary python-dotenv bcrypt
  - .env com SUPABASE_URL e SUPABASE_SERVICE_KEY preenchidos
  - Senha do banco disponível em: Supabase Dashboard → Settings → Database → Database password

Uso:
    python scripts/setup.py
    python scripts/setup.py --db-password SENHA --email admin@empresa.com --nome "Nome" --senha SenhaApp123
"""
import sys
import os
import argparse
import getpass as gp

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

# ── Extrai o host do Supabase a partir da SUPABASE_URL ────────────────────────
supabase_url = os.environ.get("SUPABASE_URL", "")
if not supabase_url:
    print("Erro: SUPABASE_URL não definida no .env")
    sys.exit(1)

# https://xyzxyz.supabase.co  →  db.xyzxyz.supabase.co
project_ref = supabase_url.replace("https://", "").split(".")[0]
db_host = f"db.{project_ref}.supabase.co"

MIGRATION_SQL = """
CREATE TABLE IF NOT EXISTS usuarios (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email         TEXT UNIQUE NOT NULL,
    senha_hash    TEXT NOT NULL,
    nome          TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'operador'
                  CHECK (role IN ('admin', 'planejador', 'operador')),
    ativo         BOOLEAN NOT NULL DEFAULT TRUE,
    ultimo_acesso TIMESTAMPTZ,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS tentativas_login (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email        TEXT NOT NULL,
    ip           TEXT,
    sucesso      BOOLEAN DEFAULT FALSE,
    tentativa_em TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tentativas_email_ts
    ON tentativas_login(email, tentativa_em DESC);

CREATE INDEX IF NOT EXISTS idx_usuarios_email
    ON usuarios(email);
"""


def run_migration(cur):
    print("→ Executando migration...")
    cur.execute(MIGRATION_SQL)
    print("  ✓ Tabelas criadas (ou já existiam).")


def criar_admin(cur, email: str, nome: str, senha: str):
    import bcrypt
    senha_hash = bcrypt.hashpw(senha.encode(), bcrypt.gensalt(rounds=12)).decode()
    cur.execute("SELECT id FROM usuarios WHERE email = %s", (email,))
    if cur.fetchone():
        print(f"  ⚠ Usuário '{email}' já existe — pulando criação.")
        return
    cur.execute(
        "INSERT INTO usuarios (email, senha_hash, nome, role, ativo) VALUES (%s, %s, %s, 'admin', TRUE)",
        (email, senha_hash, nome),
    )
    print(f"  ✓ Admin '{nome}' ({email}) criado com sucesso!")


def main():
    parser = argparse.ArgumentParser(description="Setup inicial do Opus WMS")
    parser.add_argument("--db-password", help="Senha do banco PostgreSQL do Supabase")
    parser.add_argument("--email",       help="E-mail do admin")
    parser.add_argument("--nome",        help="Nome completo do admin")
    parser.add_argument("--senha",       help="Senha de acesso ao sistema (mín. 8 chars)")
    args = parser.parse_args()

    print("=== Opus WMS — Setup ===\n")
    print(f"Supabase host: {db_host}\n")
    print("Onde encontrar a senha do banco:")
    print("  Supabase Dashboard → Settings → Database → Database password\n")

    db_password = args.db_password or gp.getpass("Senha do banco PostgreSQL: ")
    if not db_password:
        print("Senha do banco não pode ser vazia.")
        sys.exit(1)

    # Dados do admin
    email = (args.email or input("\nE-mail do admin: ")).strip()
    nome  = (args.nome  or input("Nome completo:   ")).strip()
    if not email or not nome:
        print("E-mail e nome são obrigatórios.")
        sys.exit(1)

    if args.senha:
        senha = args.senha
    else:
        senha    = gp.getpass("Senha do sistema (mín. 8 chars): ")
        confirma = gp.getpass("Confirmar senha: ")
        if senha != confirma:
            print("Senhas não coincidem.")
            sys.exit(1)
    if len(senha) < 8:
        print("Senha muito curta.")
        sys.exit(1)

    try:
        import psycopg2
    except ImportError:
        print("\nErro: psycopg2 não instalado. Execute:")
        print("  pip install psycopg2-binary")
        sys.exit(1)

    print("\n→ Conectando ao banco...")
    try:
        conn = psycopg2.connect(
            host=db_host,
            port=5432,
            dbname="postgres",
            user="postgres",
            password=db_password,
            connect_timeout=10,
            sslmode="require",
        )
        conn.autocommit = False
    except Exception as e:
        print(f"  Erro de conexão: {e}")
        print("\nVerifique a senha e tente novamente.")
        sys.exit(1)

    print("  ✓ Conectado.\n")

    try:
        with conn.cursor() as cur:
            run_migration(cur)
            print()
            criar_admin(cur, email, nome, senha)
        conn.commit()
        print("\n=== Setup concluído! ===")
        print("Agora faça o deploy: vercel deploy --prod")
    except Exception as e:
        conn.rollback()
        print(f"\nErro durante o setup: {e}")
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
