-- Backward-compatible additions; no CVs or letters are deleted by this migration.
ALTER TABLE public.job_cache ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_job_cache_user_id ON public.job_cache(user_id);
REVOKE ALL ON public.job_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.job_cache TO service_role;
DROP POLICY IF EXISTS job_cache_read_authenticated ON public.job_cache;
DROP POLICY IF EXISTS job_cache_insert_service ON public.job_cache;
DROP POLICY IF EXISTS job_cache_update_service ON public.job_cache;
DROP POLICY IF EXISTS job_cache_service_only ON public.job_cache;
CREATE POLICY job_cache_service_only ON public.job_cache FOR ALL TO service_role USING (true) WITH CHECK (true);
COMMENT ON TABLE public.job_cache IS 'Server-only, user-scoped URL cache. Pasted text is not cached. Read TTL 24h; expired rows are cleaned daily.';

CREATE TABLE IF NOT EXISTS public.ai_usage_daily (
  day date PRIMARY KEY,
  calls integer NOT NULL CHECK (calls >= 0),
  reserved_tokens bigint NOT NULL CHECK (reserved_tokens >= 0)
);
ALTER TABLE public.ai_usage_daily ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_usage_daily FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_usage_daily TO service_role;
DROP POLICY IF EXISTS ai_usage_service_only ON public.ai_usage_daily;
CREATE POLICY ai_usage_service_only ON public.ai_usage_daily FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.reserve_ai_quota(p_tokens integer, p_max_calls integer, p_max_tokens bigint)
RETURNS boolean LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_allowed boolean;
BEGIN
  IF p_tokens <= 0 OR p_max_calls <= 0 OR p_max_tokens <= 0 THEN
    RAISE EXCEPTION 'Invalid quota parameters';
  END IF;
  INSERT INTO public.ai_usage_daily(day, calls, reserved_tokens)
    SELECT (now() AT TIME ZONE 'UTC')::date, 1, p_tokens WHERE p_tokens <= p_max_tokens
    ON CONFLICT (day) DO UPDATE SET
      calls = ai_usage_daily.calls + 1,
      reserved_tokens = ai_usage_daily.reserved_tokens + p_tokens
      WHERE ai_usage_daily.calls < p_max_calls
        AND ai_usage_daily.reserved_tokens + p_tokens <= p_max_tokens
    RETURNING true INTO v_allowed;
  RETURN coalesce(v_allowed, false);
END;
$$;
REVOKE ALL ON FUNCTION public.reserve_ai_quota(integer, integer, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_ai_quota(integer, integer, bigint) TO service_role;

CREATE OR REPLACE FUNCTION public.cleanup_poc_operational_data()
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE v_cache integer; v_limits integer; v_budget integer;
BEGIN
  DELETE FROM public.job_cache WHERE id IN
    (SELECT id FROM public.job_cache WHERE expires_at < now() ORDER BY expires_at LIMIT 1000);
  GET DIAGNOSTICS v_cache = ROW_COUNT;
  DELETE FROM public.rate_limits WHERE id IN
    (SELECT id FROM public.rate_limits WHERE window_start < now() - interval '7 days' ORDER BY window_start LIMIT 1000);
  GET DIAGNOSTICS v_limits = ROW_COUNT;
  DELETE FROM public.ai_usage_daily WHERE day < (now() AT TIME ZONE 'UTC')::date - 7;
  GET DIAGNOSTICS v_budget = ROW_COUNT;
  RETURN jsonb_build_object('cache', v_cache, 'rate_limits', v_limits, 'budget_days', v_budget);
END;
$$;
REVOKE ALL ON FUNCTION public.cleanup_poc_operational_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_poc_operational_data() TO service_role;

-- Only the authenticated server route supplies the current user's ID.
CREATE OR REPLACE FUNCTION public.delete_user_poc_data(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  DELETE FROM public.applications WHERE user_id = p_user_id;
  DELETE FROM public.cv_profiles WHERE user_id = p_user_id;
  DELETE FROM public.job_cache WHERE user_id = p_user_id;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_user_poc_data(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_user_poc_data(uuid) TO service_role;
