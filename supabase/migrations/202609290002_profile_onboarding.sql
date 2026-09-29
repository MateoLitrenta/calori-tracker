-- Existing profiles keep access to the app. Only future profiles need onboarding.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ALTER COLUMN onboarding_completed SET DEFAULT false;
