-- ============================================================
-- Opus WMS — Autenticação e Controle de Acesso
-- ============================================================

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
