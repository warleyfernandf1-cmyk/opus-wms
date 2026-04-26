-- Câmara 02: garante que as ruas R01 e R02 tenham posições reais de armazenamento.
-- O CORREDOR nessas ruas continua como gap (porta), mas as posições de rua são válidas.

-- Garante que qualquer registro de rua (não corredor) em R01/R02 não seja marcado como gap
UPDATE posicoes_camara
   SET is_gap = false
 WHERE camara = '02'
   AND tipo   = 'rua'
   AND rua    IN (1, 2);

-- Insere posições ausentes (C02-R01-P01 … C02-R01-P06)
INSERT INTO posicoes_camara (id, camara, tipo, rua, posicao, status, is_gap)
VALUES
  ('C02-R01-P01', '02', 'rua', 1, 1, 'livre', false),
  ('C02-R01-P02', '02', 'rua', 1, 2, 'livre', false),
  ('C02-R01-P03', '02', 'rua', 1, 3, 'livre', false),
  ('C02-R01-P04', '02', 'rua', 1, 4, 'livre', false),
  ('C02-R01-P05', '02', 'rua', 1, 5, 'livre', false),
  ('C02-R01-P06', '02', 'rua', 1, 6, 'livre', false)
ON CONFLICT (id) DO UPDATE SET is_gap = false;

-- Insere posições ausentes (C02-R02-P01 … C02-R02-P06)
INSERT INTO posicoes_camara (id, camara, tipo, rua, posicao, status, is_gap)
VALUES
  ('C02-R02-P01', '02', 'rua', 2, 1, 'livre', false),
  ('C02-R02-P02', '02', 'rua', 2, 2, 'livre', false),
  ('C02-R02-P03', '02', 'rua', 2, 3, 'livre', false),
  ('C02-R02-P04', '02', 'rua', 2, 4, 'livre', false),
  ('C02-R02-P05', '02', 'rua', 2, 5, 'livre', false),
  ('C02-R02-P06', '02', 'rua', 2, 6, 'livre', false)
ON CONFLICT (id) DO UPDATE SET is_gap = false;
