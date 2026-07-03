REVOKE ALL ON FUNCTION public.get_available_credits(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_credit_cost(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_available_credits(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_credit_cost(TEXT) TO service_role;
