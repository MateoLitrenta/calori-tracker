ALTER TABLE public.meals ADD COLUMN IF NOT EXISTS photo_path text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.meals'::regclass AND conname = 'meals_photo_path_owner_check') THEN
    ALTER TABLE public.meals ADD CONSTRAINT meals_photo_path_owner_check
      CHECK (photo_path IS NULL OR photo_path LIKE user_id::text || '/%');
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meal-photos', 'meal-photos', false, 1048576, ARRAY['image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "meal_photos_select_own" ON storage.objects;
DROP POLICY IF EXISTS "meal_photos_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "meal_photos_update_own" ON storage.objects;
DROP POLICY IF EXISTS "meal_photos_delete_own" ON storage.objects;

CREATE POLICY "meal_photos_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'meal-photos' AND split_part(name, '/', 1) = (SELECT auth.uid())::text);

CREATE POLICY "meal_photos_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'meal-photos' AND split_part(name, '/', 1) = (SELECT auth.uid())::text);

CREATE POLICY "meal_photos_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'meal-photos' AND split_part(name, '/', 1) = (SELECT auth.uid())::text)
  WITH CHECK (bucket_id = 'meal-photos' AND split_part(name, '/', 1) = (SELECT auth.uid())::text);

CREATE POLICY "meal_photos_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'meal-photos' AND split_part(name, '/', 1) = (SELECT auth.uid())::text);
