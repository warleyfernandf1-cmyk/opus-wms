-- Câmara 02: a porta fica nas colunas R13 e R12 (posições sequenciais 1 e 2 do corredor).
-- As posições 12 e 13 (R02 e R01) eram gaps incorretos — devem voltar a ser posições normais.

UPDATE posicoes_camara
   SET is_gap = true
 WHERE camara = '02'
   AND tipo   = 'corredor'
   AND posicao IN (1, 2);

UPDATE posicoes_camara
   SET is_gap = false
 WHERE camara = '02'
   AND tipo   = 'corredor'
   AND posicao IN (12, 13);
