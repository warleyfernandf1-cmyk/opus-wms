-- ============================================================
-- Opus WMS — Schema Inicial
-- ============================================================

-- Pallets (estado atual do ciclo de vida)
CREATE TABLE IF NOT EXISTS pallets (
    id                TEXT PRIMARY KEY,
    nro_pallet        TEXT NOT NULL,
    qtd_caixas        INTEGER NOT NULL,
    data_embalamento  DATE NOT NULL,
    variedade         TEXT NOT NULL,
    classificacao     TEXT NOT NULL,
    safra             TEXT NOT NULL,
    embalagem         TEXT NOT NULL,
    rotulo            TEXT NOT NULL,
    produtor          TEXT NOT NULL,
    caixa             TEXT NOT NULL,
    peso              NUMERIC(10,2) NOT NULL,
    area              TEXT NOT NULL,
    controle          TEXT NOT NULL,
    mercado           TEXT NOT NULL,
    temp_entrada      NUMERIC(5,2),
    temp_saida        NUMERIC(5,2),
    tunel             TEXT,
    boca              INTEGER,
    fase              TEXT NOT NULL DEFAULT 'recepcao',
    camara            TEXT,
    rua               INTEGER,
    posicao           INTEGER,
    is_adicao         BOOLEAN DEFAULT FALSE,
    created_at        TIMESTAMPTZ DEFAULT NOW(),
    updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- Sessões de Resfriamento
CREATE TABLE IF NOT EXISTS sessoes_resfriamento (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tunel         TEXT NOT NULL,
    iniciado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    finalizado_em TIMESTAMPTZ,
    temp_saida    NUMERIC(5,2),
    oa_id         TEXT,
    status        TEXT DEFAULT 'ativa'
);

-- Ordens de Armazenamento
CREATE TABLE IF NOT EXISTS ordens_armazenamento (
    id          TEXT PRIMARY KEY,
    sessao_id   UUID REFERENCES sessoes_resfriamento(id),
    criada_em   TIMESTAMPTZ DEFAULT NOW(),
    executada_em TIMESTAMPTZ,
    status      TEXT DEFAULT 'pendente',
    dados       JSONB
);

-- Posições das Câmaras
-- C01: ruas 1-13, posições 1-6 + corredor (gaps: pos 7,8)
-- C02: ruas 1-13, posições 1-6 + corredor (gaps: pos 12,13)
CREATE TABLE IF NOT EXISTS posicoes_camara (
    id         TEXT PRIMARY KEY,
    camara     TEXT NOT NULL,
    tipo       TEXT NOT NULL DEFAULT 'rua',
    rua        INTEGER NOT NULL,
    posicao    INTEGER NOT NULL,
    status     TEXT DEFAULT 'livre',
    pallet_id  TEXT REFERENCES pallets(id),
    reserva_id TEXT,
    is_gap     BOOLEAN DEFAULT FALSE
);

-- Ordens de Picking
CREATE TABLE IF NOT EXISTS ordens_picking (
    id          TEXT PRIMARY KEY,
    pallet_ids  JSONB NOT NULL,
    posicoes    JSONB,
    status      TEXT DEFAULT 'pendente',
    criada_em   TIMESTAMPTZ DEFAULT NOW(),
    executada_em TIMESTAMPTZ,
    observacoes TEXT
);

-- Ordens de Expedição
CREATE TABLE IF NOT EXISTS ordens_expedicao (
    id           TEXT PRIMARY KEY,
    pallet_ids   JSONB NOT NULL,
    status       TEXT DEFAULT 'pendente',
    criada_em    TIMESTAMPTZ DEFAULT NOW(),
    executada_em TIMESTAMPTZ
);

-- Inventários
CREATE TABLE IF NOT EXISTS inventarios (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status       TEXT DEFAULT 'em_andamento',
    iniciado_em  TIMESTAMPTZ DEFAULT NOW(),
    finalizado_em TIMESTAMPTZ,
    acuracidade  NUMERIC(5,2)
);

CREATE TABLE IF NOT EXISTS itens_inventario (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    inventario_id UUID REFERENCES inventarios(id),
    pallet_id     TEXT REFERENCES pallets(id),
    qtd_sistema   INTEGER,
    qtd_contada   INTEGER,
    divergencia   INTEGER,
    contado       BOOLEAN DEFAULT FALSE
);

-- Histórico / Audit Trail
CREATE TABLE IF NOT EXISTS historico (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pallet_id      TEXT,
    acao           TEXT NOT NULL,
    fase_anterior  TEXT,
    fase_nova      TEXT,
    dados          JSONB,
    usuario        TEXT,
    created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Relatórios
CREATE TABLE IF NOT EXISTS relatorios (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    modulo           TEXT NOT NULL,
    titulo           TEXT NOT NULL,
    dados            JSONB,
    inicio_execucao  TIMESTAMPTZ,
    fim_execucao     TIMESTAMPTZ,
    tempo_medio_s    NUMERIC,
    created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Seed: posições das câmaras
-- ============================================================
-- Câmara 01: 13 ruas × 6 posições
-- Câmara 02: 13 ruas × 6 posições
-- Corredor de cada câmara: 11 posições úteis (+ gaps de porta)

DO $$
DECLARE
    c TEXT;
    r INT;
    p INT;
    pos_id TEXT;
BEGIN
    FOREACH c IN ARRAY ARRAY['01','02'] LOOP
        FOR r IN 1..13 LOOP
            FOR p IN 1..6 LOOP
                pos_id := 'C' || c || '-R' || LPAD(r::TEXT,2,'0') || '-P' || LPAD(p::TEXT,2,'0');
                INSERT INTO posicoes_camara(id, camara, tipo, rua, posicao, is_gap)
                VALUES (pos_id, c, 'rua', r, p, FALSE)
                ON CONFLICT (id) DO NOTHING;
            END LOOP;
        END LOOP;
        -- Corredor: 13 posições, com gaps por câmara
        FOR p IN 1..13 LOOP
            pos_id := 'C' || c || '-COR-P' || LPAD(p::TEXT,2,'0');
            INSERT INTO posicoes_camara(id, camara, tipo, rua, posicao, is_gap)
            VALUES (
                pos_id, c, 'corredor', 0, p,
                CASE
                    WHEN c = '01' AND p IN (7,8)   THEN TRUE
                    WHEN c = '02' AND p IN (12,13)  THEN TRUE
                    ELSE FALSE
                END
            )
            ON CONFLICT (id) DO NOTHING;
        END LOOP;
    END LOOP;
END $$;

-- Índices úteis
CREATE INDEX IF NOT EXISTS idx_pallets_fase        ON pallets(fase);
CREATE INDEX IF NOT EXISTS idx_pallets_tunel_boca  ON pallets(tunel, boca);
CREATE INDEX IF NOT EXISTS idx_posicoes_status      ON posicoes_camara(status);
CREATE INDEX IF NOT EXISTS idx_historico_pallet     ON historico(pallet_id);
CREATE INDEX IF NOT EXISTS idx_historico_created    ON historico(created_at DESC);
