ALTER TABLE public.assessments
  ADD COLUMN IF NOT EXISTS paper_pdf_path text,
  ADD COLUMN IF NOT EXISTS mark_scheme_pdf_path text,
  ADD COLUMN IF NOT EXISTS transcript_pdf_path text,
  ADD COLUMN IF NOT EXISTS paper_pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS mark_scheme_pdf_generated_at timestamptz,
  ADD COLUMN IF NOT EXISTS transcript_pdf_generated_at timestamptz;