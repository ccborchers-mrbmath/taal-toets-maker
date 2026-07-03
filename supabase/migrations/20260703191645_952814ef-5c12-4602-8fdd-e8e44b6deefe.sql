ALTER TABLE public.listening_scripts
  ADD COLUMN IF NOT EXISTS audio_path text,
  ADD COLUMN IF NOT EXISTS audio_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS audio_stale boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS previous_transcript text,
  ADD COLUMN IF NOT EXISTS previous_audio_path text,
  ADD COLUMN IF NOT EXISTS previous_generated_at timestamptz;