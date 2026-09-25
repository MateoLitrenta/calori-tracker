-- Apply before deploying the avatar UI. Paths are relative to the private avatars bucket.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_path text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_avatar_path_owner_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_avatar_path_owner_check
      CHECK (avatar_path IS NULL OR avatar_path IN (
        COALESCE(user_id::text, id::text) || '/profile.webp',
        COALESCE(user_id::text, id::text) || '/profile.jpg'
      ));
  END IF;
END $$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 524288, ARRAY['image/webp', 'image/jpeg'])
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "avatars_select_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_insert_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;

CREATE POLICY "avatars_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'avatars' AND name IN (
    (SELECT auth.uid())::text || '/profile.webp',
    (SELECT auth.uid())::text || '/profile.jpg'
  ));

CREATE POLICY "avatars_insert_own" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'avatars' AND name IN (
    (SELECT auth.uid())::text || '/profile.webp',
    (SELECT auth.uid())::text || '/profile.jpg'
  ));

CREATE POLICY "avatars_update_own" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'avatars' AND name IN (
    (SELECT auth.uid())::text || '/profile.webp',
    (SELECT auth.uid())::text || '/profile.jpg'
  ))
  WITH CHECK (bucket_id = 'avatars' AND name IN (
    (SELECT auth.uid())::text || '/profile.webp',
    (SELECT auth.uid())::text || '/profile.jpg'
  ));

CREATE POLICY "avatars_delete_own" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'avatars' AND name IN (
    (SELECT auth.uid())::text || '/profile.webp',
    (SELECT auth.uid())::text || '/profile.jpg'
  ));
