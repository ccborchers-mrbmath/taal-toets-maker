
REVOKE EXECUTE ON FUNCTION public.revoke_user_credits(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.grant_upgrade_credits(uuid, text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_user_credits(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_upgrade_credits(uuid, text, text, timestamptz, text, text) TO service_role;
