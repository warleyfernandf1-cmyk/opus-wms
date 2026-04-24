"""
Bootstrap: cria o primeiro usuário admin do sistema.
Execute uma única vez, localmente, com as credenciais do .env.

Uso interativo:
    python scripts/criar_admin.py

Uso via argumentos (sem prompts):
    python scripts/criar_admin.py --email admin@empresa.com --nome "Seu Nome" --senha SuaSenha123
"""
import sys
import os
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from api.db.client import get_db
from api.auth.hashing import hash_senha


def main():
    parser = argparse.ArgumentParser(description="Criar primeiro admin do Opus WMS")
    parser.add_argument("--email", help="E-mail do admin")
    parser.add_argument("--nome",  help="Nome completo do admin")
    parser.add_argument("--senha", help="Senha (mín. 8 caracteres)")
    args = parser.parse_args()

    # Modo não-interativo se todos os args foram fornecidos
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
            senha    = getpass.getpass("Senha (mín. 8 caracteres): ")
            confirma = getpass.getpass("Confirmar senha: ")
            if senha != confirma:
                print("As senhas não coincidem.")
                sys.exit(1)

    if len(senha) < 8:
        print("Senha muito curta (mínimo 8 caracteres).")
        sys.exit(1)

    db = get_db()

    existente = db.table("usuarios").select("id").eq("email", email).execute().data
    if existente:
        print(f"Erro: já existe um usuário com o e-mail '{email}'.")
        sys.exit(1)

    db.table("usuarios").insert({
        "email":      email,
        "senha_hash": hash_senha(senha),
        "nome":       nome,
        "role":       "admin",
        "ativo":      True,
    }).execute()

    print(f"Admin '{nome}' ({email}) criado com sucesso!")
    print("Acesse o sistema e faça login.")


if __name__ == "__main__":
    main()
