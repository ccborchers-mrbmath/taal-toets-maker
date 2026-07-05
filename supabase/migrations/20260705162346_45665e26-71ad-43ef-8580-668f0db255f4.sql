
-- Align subscriptions table with Paddle webhook handler expectations.
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS environment TEXT NOT NULL DEFAULT 'sandbox',
  ADD COLUMN IF NOT EXISTS product_id TEXT,
  ADD COLUMN IF NOT EXISTS price_id TEXT;

-- provider_subscription_id must be unique for the webhook upsert to work.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'subscriptions_provider_subscription_id_key'
  ) THEN
    ALTER TABLE public.subscriptions
      ADD CONSTRAINT subscriptions_provider_subscription_id_key
      UNIQUE (provider_subscription_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_env
  ON public.subscriptions(user_id, environment);

-- has_active_subscription helper — defaults to live as safety net.
CREATE OR REPLACE FUNCTION public.has_active_subscription(
  _user_id UUID,
  _env TEXT DEFAULT 'live'
) RETURNS BOOLEAN
LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions
    WHERE user_id = _user_id
      AND environment = _env
      AND (
        (status IN ('active','trialing','past_due')
          AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  )
$$;

-- Grant credits for a subscription billing cycle. Sets expires_at to
-- end-of-next-cycle so unused credits roll over exactly once, then drop.
-- Called from the webhook on transaction.completed for subscription txns.
CREATE OR REPLACE FUNCTION public.grant_subscription_credits(
  _user_id UUID,
  _price_id TEXT,
  _period_end TIMESTAMPTZ,
  _subscription_id TEXT,
  _transaction_id TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  credits INTEGER;
  new_expires TIMESTAMPTZ;
  existing UUID;
  gid UUID;
BEGIN
  -- Idempotency: don't double-grant for the same transaction.
  SELECT id INTO existing FROM public.credit_grants
  WHERE metadata->>'transaction_id' = _transaction_id
  LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  credits := CASE _price_id
    WHEN 'basic_monthly' THEN 70
    WHEN 'pro_monthly'   THEN 160
    ELSE 0
  END;
  IF credits <= 0 THEN RETURN NULL; END IF;

  -- Expire prior unspent subscription grants at end of the current period,
  -- so they roll over into the next cycle but not beyond it.
  UPDATE public.credit_grants
    SET expires_at = LEAST(COALESCE(expires_at, _period_end), _period_end)
    WHERE user_id = _user_id
      AND source = 'subscription'
      AND remaining > 0;

  -- New grant runs from now until end of NEXT cycle (rollover once).
  new_expires := _period_end + INTERVAL '31 days';

  gid := public.grant_credits(
    _user_id,
    credits,
    'subscription',
    new_expires,
    jsonb_build_object(
      'price_id', _price_id,
      'subscription_id', _subscription_id,
      'transaction_id', _transaction_id,
      'period_end', _period_end
    )
  );
  RETURN gid;
END $$;

-- Grant top-up credits (no expiry).
CREATE OR REPLACE FUNCTION public.grant_topup_credits(
  _user_id UUID,
  _price_id TEXT,
  _transaction_id TEXT
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  credits INTEGER;
  existing UUID;
  gid UUID;
BEGIN
  SELECT id INTO existing FROM public.credit_grants
  WHERE metadata->>'transaction_id' = _transaction_id
  LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  credits := CASE _price_id
    WHEN 'topup_small_once' THEN 35
    WHEN 'topup_large_once' THEN 65
    ELSE 0
  END;
  IF credits <= 0 THEN RETURN NULL; END IF;

  gid := public.grant_credits(
    _user_id,
    credits,
    'topup',
    NULL,
    jsonb_build_object(
      'price_id', _price_id,
      'transaction_id', _transaction_id
    )
  );
  RETURN gid;
END $$;

-- Lock down: only service_role should call the grant helpers directly.
REVOKE EXECUTE ON FUNCTION public.grant_subscription_credits(UUID,TEXT,TIMESTAMPTZ,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_topup_credits(UUID,TEXT,TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.grant_subscription_credits(UUID,TEXT,TIMESTAMPTZ,TEXT,TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_topup_credits(UUID,TEXT,TEXT) TO service_role;
