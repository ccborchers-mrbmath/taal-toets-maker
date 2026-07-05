-- Revoke EXECUTE from authenticated/anon/public on privileged SECURITY DEFINER
-- functions that should only be called by trusted server code (service_role).
-- The credit grant/spend/revoke functions are only invoked from webhook
-- handlers and server-side helpers using the service role client; signed-in
-- users must not be able to call them directly (privilege escalation risk).

REVOKE ALL ON FUNCTION public.grant_credits(uuid, integer, text, timestamptz, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_topup_credits(uuid, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_upgrade_credits(uuid, text, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_user_credits(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.grant_subscription_credits(uuid, text, timestamptz, text, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.grant_credits(uuid, integer, text, timestamptz, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.spend_credits(uuid, integer, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_topup_credits(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_upgrade_credits(uuid, text, text, timestamptz, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.revoke_user_credits(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.grant_subscription_credits(uuid, text, timestamptz, text, text) TO service_role;