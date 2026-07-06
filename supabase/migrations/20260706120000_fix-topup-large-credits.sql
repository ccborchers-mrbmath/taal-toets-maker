-- Fix top-up shortchange: "Top-up — 2 papers" (topup_large_once, R179) is
-- advertised on the pricing page as 70 credits, but grant_topup_credits was
-- only depositing 65. Correct the amount to match what's actually promised.
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
    WHEN 'topup_large_once' THEN 70
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
