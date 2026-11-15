-- Restrict server-only RPCs and fix mutable function search paths.
-- No application data is modified by this migration.
ALTER FUNCTION public.update_updated_at() SET search_path = '';
ALTER FUNCTION public.handle_new_user() SET search_path = '';
ALTER FUNCTION public.increment_rate_limit_if_allowed(uuid, text, timestamptz, integer)
  SET search_path = '';

REVOKE EXECUTE ON FUNCTION public.update_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_rate_limit_if_allowed(uuid, text, timestamptz, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_rate_limit_if_allowed(uuid, text, timestamptz, integer)
  TO service_role;

-- Counters are maintained by the server, never by browser clients.
REVOKE ALL ON public.rate_limits FROM anon, authenticated;
GRANT ALL ON public.rate_limits TO service_role;
