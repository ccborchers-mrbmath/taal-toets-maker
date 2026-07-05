
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
      AND (auth.uid() = _user_id OR auth.role() = 'service_role')
      AND environment = _env
      AND (
        (status IN ('active','trialing','past_due')
          AND (current_period_end IS NULL OR current_period_end > now()))
        OR (status = 'canceled' AND current_period_end > now())
      )
  )
$$;

REVOKE EXECUTE ON FUNCTION public.has_active_subscription(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(UUID, TEXT) TO authenticated, service_role;
