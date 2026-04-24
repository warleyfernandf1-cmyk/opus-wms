-- Migração 005: Colunas de foto e sessao_id nos pallets
-- Executar no SQL Editor do Supabase

ALTER TABLE pallets
  ADD COLUMN IF NOT EXISTS sessao_id          TEXT,
  ADD COLUMN IF NOT EXISTS foto_temp_entrada  TEXT,
  ADD COLUMN IF NOT EXISTS foto_espelho       TEXT,
  ADD COLUMN IF NOT EXISTS foto_pallet_entrada TEXT,
  ADD COLUMN IF NOT EXISTS foto_temp_saida    TEXT;

-- Bucket de fotos temporárias
-- (Execute SEM RLS quando aparecer o aviso)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'fotos-pallets',
  'fotos-pallets',
  true,
  10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de acesso ao bucket
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'fotos_pallets_read' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "fotos_pallets_read" ON storage.objects
      FOR SELECT USING (bucket_id = 'fotos-pallets');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'fotos_pallets_write' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "fotos_pallets_write" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'fotos-pallets');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE policyname = 'fotos_pallets_delete' AND schemaname = 'storage'
  ) THEN
    CREATE POLICY "fotos_pallets_delete" ON storage.objects
      FOR DELETE USING (bucket_id = 'fotos-pallets');
  END IF;
END $$;
