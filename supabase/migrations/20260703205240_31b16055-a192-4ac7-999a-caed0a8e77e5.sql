-- =========================================================
-- 1. credit_prices: cost per operation
-- =========================================================
CREATE TABLE public.credit_prices (
  op TEXT PRIMARY KEY,
  credits INTEGER NOT NULL CHECK (credits >= 0),
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.credit_prices TO authenticated;
GRANT ALL ON public.credit_prices TO service_role;

ALTER TABLE public.credit_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Signed-in users can read prices"
  ON public.credit_prices FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can manage prices"
  ON public.credit_prices FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.credit_prices (op, credits, description) VALUES
  ('text_paper',          1, 'Generate a full paper script (text)'),
  ('image_option',        1, 'Generate one option image'),
  ('audio_exercise',      4, 'Generate the stitched MP3 for one exercise'),
  ('segment_regenerate',  1, 'Regenerate one script row in the audio editor');

-- =========================================================
-- 2. credit_grants: every issuance, FIFO consumed
-- =========================================================
CREATE TABLE public.credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL CHECK (amount > 0),
  remaining INTEGER NOT NULL CHECK (remaining >= 0),
  source TEXT NOT NULL CHECK (source IN ('signup','subscription','topup','admin','refund','migration')),
  expires_at TIMESTAMPTZ,           -- NULL = never expires (top-ups, bonuses)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX credit_grants_user_active_idx
  ON public.credit_grants (user_id, expires_at NULLS LAST, created_at)
  WHERE remaining > 0;

GRANT SELECT ON public.credit_grants TO authenticated;
GRANT ALL ON public.credit_grants TO service_role;

ALTER TABLE public.credit_grants ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own grants"
  ON public.credit_grants FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT/UPDATE policies for authenticated: all writes go through
-- SECURITY DEFINER functions or service_role.

-- =========================================================
-- 3. subscriptions: stub for upcoming Paddle wiring
-- =========================================================
CREATE TABLE public.subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'paddle' CHECK (provider IN ('paddle','stripe','manual')),
  provider_customer_id TEXT,
  provider_subscription_id TEXT,
  tier TEXT CHECK (tier IN ('basic','pro')),
  status TEXT NOT NULL DEFAULT 'inactive'
    CHECK (status IN ('active','trialing','past_due','canceled','inactive')),
  monthly_credits INTEGER,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT ON public.subscriptions TO authenticated;
GRANT ALL ON public.subscriptions TO service_role;

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscription"
  ON public.subscriptions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================
-- 4. RPCs: get_available_credits, get_credit_cost, grant_credits, spend_credits
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_available_credits(_user_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(remaining), 0)::INTEGER
  FROM public.credit_grants
  WHERE user_id = _user_id
    AND remaining > 0
    AND (expires_at IS NULL OR expires_at > now())
$$;

CREATE OR REPLACE FUNCTION public.get_credit_cost(_op TEXT)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT credits FROM public.credit_prices WHERE op = _op
$$;

-- Grant credits to a user. Writes ledger row + refreshes balance cache.
CREATE OR REPLACE FUNCTION public.grant_credits(
  _user_id UUID,
  _amount INTEGER,
  _source TEXT,
  _expires_at TIMESTAMPTZ DEFAULT NULL,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_grant_id UUID;
  new_total INTEGER;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Grant amount must be positive';
  END IF;

  INSERT INTO public.credit_grants (user_id, amount, remaining, source, expires_at, metadata)
  VALUES (_user_id, _amount, _amount, _source, _expires_at, COALESCE(_metadata, '{}'::jsonb))
  RETURNING id INTO new_grant_id;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, _amount, 'grant_' || _source, COALESCE(_metadata, '{}'::jsonb) || jsonb_build_object('grant_id', new_grant_id));

  SELECT public.get_available_credits(_user_id) INTO new_total;
  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, new_total)
    ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance;

  RETURN new_grant_id;
END $$;

-- Spend credits: atomic, FIFO by expiry then age. Refuses if balance short.
CREATE OR REPLACE FUNCTION public.spend_credits(
  _user_id UUID,
  _amount INTEGER,
  _reason TEXT,
  _metadata JSONB DEFAULT '{}'::jsonb
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  remaining_to_spend INTEGER := _amount;
  new_total INTEGER;
  grant_row RECORD;
  take INTEGER;
BEGIN
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Spend amount must be positive';
  END IF;

  IF public.get_available_credits(_user_id) < _amount THEN
    RAISE EXCEPTION 'Insufficient credits' USING ERRCODE = 'P0001';
  END IF;

  FOR grant_row IN
    SELECT id, remaining
    FROM public.credit_grants
    WHERE user_id = _user_id
      AND remaining > 0
      AND (expires_at IS NULL OR expires_at > now())
    ORDER BY (expires_at IS NULL), expires_at ASC, created_at ASC
    FOR UPDATE
  LOOP
    EXIT WHEN remaining_to_spend <= 0;
    take := LEAST(grant_row.remaining, remaining_to_spend);
    UPDATE public.credit_grants
      SET remaining = remaining - take
      WHERE id = grant_row.id;
    remaining_to_spend := remaining_to_spend - take;
  END LOOP;

  IF remaining_to_spend > 0 THEN
    RAISE EXCEPTION 'Insufficient credits (race)' USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, -_amount, _reason, COALESCE(_metadata, '{}'::jsonb));

  SELECT public.get_available_credits(_user_id) INTO new_total;
  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, new_total)
    ON CONFLICT (user_id) DO UPDATE SET balance = EXCLUDED.balance;

  RETURN new_total;
END $$;

-- =========================================================
-- 5. Backfill: move existing balances into a migration grant
-- =========================================================
INSERT INTO public.credit_grants (user_id, amount, remaining, source, expires_at, metadata)
SELECT user_id, balance, balance, 'migration', NULL,
       jsonb_build_object('note','Backfilled from credit_balances at credit-system rollout')
FROM public.credit_balances
WHERE balance > 0;

-- =========================================================
-- 6. Update handle_new_user to use grant_credits for the 3-credit signup bonus
-- =========================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user')
  ON CONFLICT DO NOTHING;

  -- Signup bonus via grant_credits (writes ledger + balance cache).
  PERFORM public.grant_credits(NEW.id, 3, 'signup', NULL, jsonb_build_object('note','Signup bonus'));

  RETURN NEW;
END $function$;

-- Allow authenticated to call the RPCs (SECURITY DEFINER)
GRANT EXECUTE ON FUNCTION public.get_available_credits(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_credit_cost(TEXT) TO authenticated;
-- spend/grant should only be called from server code (service_role or SECURITY DEFINER server fns)
REVOKE ALL ON FUNCTION public.spend_credits(UUID, INTEGER, TEXT, JSONB) FROM PUBLIC, authenticated, anon;
REVOKE ALL ON FUNCTION public.grant_credits(UUID, INTEGER, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.spend_credits(UUID, INTEGER, TEXT, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_credits(UUID, INTEGER, TEXT, TIMESTAMPTZ, JSONB) TO service_role;
