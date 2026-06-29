
-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_select_own" ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- Roles
CREATE TYPE public.app_role AS ENUM ('admin', 'user');
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

-- updated_at helper
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

CREATE TRIGGER profiles_set_updated_at BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Auto-create profile on sign-up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.credit_balances (user_id, balance) VALUES (NEW.id, 3)
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END $$;

-- Credit balances
CREATE TABLE public.credit_balances (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_balances TO authenticated;
GRANT ALL ON public.credit_balances TO service_role;
ALTER TABLE public.credit_balances ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_balances_select_own" ON public.credit_balances FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Credit ledger
CREATE TABLE public.credit_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT ON public.credit_ledger TO authenticated;
GRANT ALL ON public.credit_ledger TO service_role;
ALTER TABLE public.credit_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "credit_ledger_select_own" ON public.credit_ledger FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Now create user trigger (after credit_balances exists)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Assessments
CREATE TABLE public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  subject_code TEXT NOT NULL DEFAULT '0548',
  paper_code TEXT NOT NULL DEFAULT '0548/02',
  paper_name TEXT NOT NULL DEFAULT 'Paper 2 Listening',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | generating | ready | failed
  generation_error TEXT,
  theme_hint TEXT,
  audio_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assessments TO authenticated;
GRANT ALL ON public.assessments TO service_role;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "assessments_own_all" ON public.assessments FOR ALL TO authenticated
  USING (auth.uid() = created_by) WITH CHECK (auth.uid() = created_by);
CREATE TRIGGER assessments_set_updated_at BEFORE UPDATE ON public.assessments
FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Exercises
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assessment_id UUID NOT NULL REFERENCES public.assessments(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, -- 1..5
  kind TEXT NOT NULL,      -- 'oef1_picture' | 'oef2_dialogue' | 'oef3_talk' | 'oef4_match' | 'oef5_interview'
  rubric TEXT NOT NULL,
  intro TEXT,
  statements JSONB,        -- for Oef 4 only: [{letter:'A',text:'...'}, ...]
  UNIQUE (assessment_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.exercises TO authenticated;
GRANT ALL ON public.exercises TO service_role;
ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exercises_via_assessment" ON public.exercises FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND a.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.assessments a WHERE a.id = assessment_id AND a.created_by = auth.uid()));

-- Listening scripts
CREATE TABLE public.listening_scripts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL DEFAULT 1, -- one row for Oef 3/5, multiple for Oef 1/2/4
  speaker_label TEXT,
  transcript TEXT NOT NULL,
  duration_seconds INTEGER,
  audio_url TEXT
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listening_scripts TO authenticated;
GRANT ALL ON public.listening_scripts TO service_role;
ALTER TABLE public.listening_scripts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "scripts_via_assessment" ON public.listening_scripts FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e JOIN public.assessments a ON a.id = e.assessment_id WHERE e.id = exercise_id AND a.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e JOIN public.assessments a ON a.id = e.assessment_id WHERE e.id = exercise_id AND a.created_by = auth.uid()));

-- Questions
CREATE TABLE public.questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES public.exercises(id) ON DELETE CASCADE,
  number INTEGER NOT NULL, -- 1..40
  stem TEXT NOT NULL,
  correct_letter TEXT NOT NULL, -- 'A'..'H'
  speaker_index INTEGER, -- for Oef 4 (speaker 1..6)
  UNIQUE (exercise_id, number)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.questions TO authenticated;
GRANT ALL ON public.questions TO service_role;
ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "questions_via_assessment" ON public.questions FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exercises e JOIN public.assessments a ON a.id = e.assessment_id WHERE e.id = exercise_id AND a.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exercises e JOIN public.assessments a ON a.id = e.assessment_id WHERE e.id = exercise_id AND a.created_by = auth.uid()));

-- Question options
CREATE TABLE public.question_options (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id UUID NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  letter TEXT NOT NULL, -- 'A'..'D'
  text TEXT,
  image_prompt TEXT,
  image_url TEXT,
  UNIQUE (question_id, letter)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_options TO authenticated;
GRANT ALL ON public.question_options TO service_role;
ALTER TABLE public.question_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "options_via_assessment" ON public.question_options FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.questions q JOIN public.exercises e ON e.id = q.exercise_id JOIN public.assessments a ON a.id = e.assessment_id WHERE q.id = question_id AND a.created_by = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.questions q JOIN public.exercises e ON e.id = q.exercise_id JOIN public.assessments a ON a.id = e.assessment_id WHERE q.id = question_id AND a.created_by = auth.uid()));
