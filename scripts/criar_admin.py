"""
Bootstrap: cria o primeiro usuário admin do sistema.
Execute uma única vez, localmente, com as credenciais do .env:

    python scripts/criar_admin.py
"""
import sys
import os

# Garante que o projeto raiz está no path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from api.db.client import get_db
from api.auth.hashing import hash_senha


def main():
    print("=== Opus WMS — Criar Admin ===\n")

    email = input("E-mail: ").strip()
    if not email:
        print("E-mail não pode ser vazio.")
        sys.exit(1)

    nome = input("Nome completo: ").strip()
    if not nome:
        print("Nome não pode ser vazio.")
        sys.exit(1)

    import getpass
    senha = getpass.getpass("Senha (mín. 8 caracteres): ")
    if len(senha) < 8:
        print("Senha muito curta.")
        sys.exit(1)

    confirma = getpass.getpass("Confirmar senha: ")
    if senha != confirma:
        print("As senhas não coincidem.")
        sys.exit(1)

    db = get_db()

    existente = db.table("usuarios").select("id").eq("email", email).execute().data
    if existente:
        print(f"\nErro: já existe um usuário com o e-mail '{email}'.")
        sys.exit(1)

    db.table("usuarios").insert({
        "email":      email,
        "senha_hash": hash_senha(senha),
        "nome":       nome,
        "role":       "admin",
        "ativo":      True,
    }).execute()

    print(f"\nAdmin '{nome}' criado com sucesso!")
    print("Acesse o sistema e faça login.")


if __name__ == "__main__":
    main()
