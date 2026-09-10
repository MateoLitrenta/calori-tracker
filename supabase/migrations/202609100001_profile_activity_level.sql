-- Deploy before the application. Existing profiles and RLS policies are preserved.
-- Abort on an unexpected legacy column rather than create duplicate activity data.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'activity')
    AND NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'activity_level') THEN
    RAISE EXCEPTION 'Legacy profiles.activity exists; inspect and migrate it before deploying activity_level';
  END IF;
END $$;

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS activity_level text DEFAULT 'Sedentario';
ALTER TABLE public.profiles ALTER COLUMN activity_level SET DEFAULT 'Sedentario';
UPDATE public.profiles SET activity_level = 'Sedentario' WHERE activity_level IS NULL;
ALTER TABLE public.profiles ALTER COLUMN activity_level SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass AND conname = 'profiles_activity_level_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_activity_level_check
      CHECK (activity_level IN ('Sedentario', 'Moderado', 'Activo')) NOT VALID;
  END IF;
END $$;
ALTER TABLE public.profiles VALIDATE CONSTRAINT profiles_activity_level_check;
