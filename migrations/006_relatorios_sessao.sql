-- Garante que a tabela relatorios existe com todos os campos necessários
CREATE TABLE IF NOT EXISTS relatorios (
  id             UUID    DEFAULT gen_random_uuid() PRIMARY KEY,
  modulo         TEXT    NOT NULL,
  titulo         TEXT    NOT NULL,
  dados          JSONB,
  inicio_execucao TIMESTAMPTZ,
  fim_execucao   TIMESTAMPTZ,
  tempo_medio_s  FLOAT,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- Adiciona coluna de vínculo com a sessão (upsert seguro)
ALTER TABLE relatorios
  ADD COLUMN IF NOT EXISTS sessao_id TEXT;

-- Índice único: impede duplicatas por sessão
CREATE UNIQUE INDEX IF NOT EXISTS relatorios_sessao_id_uq
  ON relatorios(sessao_id)
  WHERE sessao_id IS NOT NULL;
