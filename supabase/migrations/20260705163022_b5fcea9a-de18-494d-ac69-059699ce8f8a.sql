
CREATE OR REPLACE FUNCTION public.revoke_user_credits(_user_id uuid, _reason text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total_revoked INTEGER := 0;
BEGIN
  SELECT COALESCE(SUM(remaining), 0)::INTEGER INTO total_revoked
  FROM public.credit_grants
  WHERE user_id = _user_id AND remaining > 0;

  IF total_revoked <= 0 THEN RETURN 0; END IF;

  UPDATE public.credit_grants
    SET remaining = 0
    WHERE user_id = _user_id AND remaining > 0;

  INSERT INTO public.credit_ledger (user_id, delta, reason, metadata)
  VALUES (_user_id, -total_revoked, 'revoke_' || _reason, jsonb_build_object('reason', _reason));

  INSERT INTO public.credit_balances (user_id, balance) VALUES (_user_id, 0)
    ON CONFLICT (user_id) DO UPDATE SET balance = 0;

  RETURN total_revoked;
END $$;

CREATE OR REPLACE FUNCTION public.grant_upgrade_credits(
  _user_id uuid,
  _old_price_id text,
  _new_price_id text,
  _period_end timestamptz,
  _subscription_id text,
  _change_key text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_credits INTEGER := CASE _old_price_id
    WHEN 'basic_monthly' THEN 70
    WHEN 'pro_monthly'   THEN 160
    ELSE 0 END;
  new_credits INTEGER := CASE _new_price_id
    WHEN 'basic_monthly' THEN 70
    WHEN 'pro_monthly'   THEN 160
    ELSE 0 END;
  diff INTEGER;
  existing UUID;
  gid UUID;
BEGIN
  diff := new_credits - old_credits;
  IF diff <= 0 THEN RETURN NULL; END IF;

  -- Idempotency by change key (e.g. subscription_id + new_price_id + timestamp).
  SELECT id INTO existing FROM public.credit_grants
  WHERE metadata->>'change_key' = _change_key
  LIMIT 1;
  IF existing IS NOT NULL THEN RETURN existing; END IF;

  gid := public.grant_credits(
    _user_id,
    diff,
    'upgrade',
    _period_end + INTERVAL '31 days',
    jsonb_build_object(
      'old_price_id', _old_price_id,
      'new_price_id', _new_price_id,
      'subscription_id', _subscription_id,
      'change_key', _change_key,
      'period_end', _period_end
    )
  );
  RETURN gid;
END $$;
