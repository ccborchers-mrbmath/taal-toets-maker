-- voice_cast: per-user library of saved ElevenLabs voices
CREATE TABLE public.voice_cast (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  voice_id TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL DEFAULT 'neutral',
  age_band TEXT NOT NULL DEFAULT 'adult',
  accent_rating SMALLINT NOT NULL DEFAULT 3,
  accent_note TEXT,
  tags TEXT[] NOT NULL DEFAULT '{}',
  suitability JSONB NOT NULL DEFAULT '{}'::jsonb,
  voice_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (created_by, voice_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_cast TO authenticated;
GRANT ALL ON public.voice_cast TO service_role;
ALTER TABLE public.voice_cast ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own voice cast"
  ON public.voice_cast FOR ALL
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

CREATE TRIGGER voice_cast_set_updated_at
  BEFORE UPDATE ON public.voice_cast
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- assessment_voice_cast: which voices are in play for an assessment
CREATE TABLE public.assessment_voice_cast (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  voice_cast_id UUID NOT NULL REFERENCES public.voice_cast(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (assessment_id, voice_cast_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessment_voice_cast TO authenticated;
GRANT ALL ON public.assessment_voice_cast TO service_role;
ALTER TABLE public.assessment_voice_cast ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own paper voice selections"
  ON public.assessment_voice_cast FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = assessment_voice_cast.assessment_id
      AND a.created_by = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.assessments a
    WHERE a.id = assessment_voice_cast.assessment_id
      AND a.created_by = auth.uid()
  ));

CREATE INDEX assessment_voice_cast_assessment_idx
  ON public.assessment_voice_cast(assessment_id);
