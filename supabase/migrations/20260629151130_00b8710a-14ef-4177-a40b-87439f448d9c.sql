ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS brief text,
  ADD COLUMN IF NOT EXISTS part_type text NOT NULL DEFAULT 'full_paper',
  ADD COLUMN IF NOT EXISTS level text NOT NULL DEFAULT 'core';