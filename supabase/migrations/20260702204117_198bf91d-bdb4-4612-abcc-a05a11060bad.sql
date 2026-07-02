ALTER TABLE public.listening_scripts ADD COLUMN IF NOT EXISTS role_gloss TEXT;
ALTER TABLE public.listening_scripts ADD COLUMN IF NOT EXISTS context TEXT;