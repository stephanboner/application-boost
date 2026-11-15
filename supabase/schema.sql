-- ============================================================
-- BewerbungsBoost – Supabase PostgreSQL Schema
-- Ausführen in: Supabase Dashboard > SQL Editor
-- ============================================================

-- Erweiterungen aktivieren
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABELLEN
-- ============================================================

-- CV-Profile (1:1 mit auth.users)
-- CV-Daten werden verschlüsselt gespeichert (AES-256 via App-Layer)
CREATE TABLE public.cv_profiles (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Verschlüsselter Roh-Text des CV (base64-encoded AES-256-GCM)
  raw_text_enc  TEXT,
  -- Strukturiertes JSON des CV (auch verschlüsselt)
  parsed_json_enc TEXT,
  -- Metadaten (unverschlüsselt, nicht-sensitiv)
  has_cv        BOOLEAN NOT NULL DEFAULT false,
  cv_source     TEXT CHECK (cv_source IN ('pdf', 'manual')) DEFAULT 'manual',
  language      TEXT NOT NULL DEFAULT 'de',
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id)
);

-- Gecachte Job-Parse-Resultate (24h TTL)
-- Verhindert doppelte API-Calls für gleiche URLs
CREATE TABLE public.job_cache (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- SHA-256 Hash des Ursprungstyps und der vollständigen URL/des Textes
  content_hash TEXT NOT NULL UNIQUE,
  -- Geparste Job-Daten als JSON
  parsed_json JSONB NOT NULL,
  -- Ursprungstyp
  source_type TEXT CHECK (source_type IN ('url', 'text')) NOT NULL,
  -- Für Debugging/Monitoring (kein PII)
  job_title   TEXT,
  company     TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- 24h TTL – abgelaufene Einträge werden per Cronjob gelöscht
  expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '24 hours')
);

-- Bewerbungsverlauf pro Nutzer
CREATE TABLE public.applications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Job-Informationen (aus Cache oder direkt)
  job_title       TEXT NOT NULL,
  company         TEXT NOT NULL DEFAULT 'Unbekannt',
  job_cache_id    UUID REFERENCES public.job_cache(id) ON DELETE SET NULL,
  -- Das generierte Bewerbungsschreiben (verschlüsselt)
  letter_enc      TEXT NOT NULL,
  -- Metadaten
  tone            TEXT CHECK (tone IN ('formal', 'balanced', 'personal')) DEFAULT 'balanced',
  language        TEXT NOT NULL DEFAULT 'de',
  word_count      INTEGER,
  -- Status
  is_exported     BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Rate Limiting Tabelle
-- Verfolgt API-Aufrufe pro Nutzer pro Stunde
CREATE TABLE public.rate_limits (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action      TEXT NOT NULL DEFAULT 'generate',
  window_start TIMESTAMPTZ NOT NULL,
  count       INTEGER NOT NULL DEFAULT 1,
  UNIQUE (user_id, action, window_start)
);

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = '';

CREATE TRIGGER update_cv_profiles_updated_at
  BEFORE UPDATE ON public.cv_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

CREATE TRIGGER update_applications_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Jeder Nutzer sieht nur seine eigenen Daten
-- ============================================================

ALTER TABLE public.cv_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

-- CV Profiles: nur eigene Zeile
CREATE POLICY "cv_profiles_own_data" ON public.cv_profiles
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Applications: nur eigene Zeilen
CREATE POLICY "applications_own_data" ON public.applications
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Job Cache: lesbar für alle authentifizierten Nutzer (gecachte Public-Daten)
CREATE POLICY "job_cache_read_authenticated" ON public.job_cache
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Job Cache: schreiben nur über Service Role (API)
CREATE POLICY "job_cache_insert_service" ON public.job_cache
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- Job Cache: update (für upsert bei existierendem content_hash)
CREATE POLICY "job_cache_update_service" ON public.job_cache
  FOR UPDATE
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Rate Limits: nur eigene
CREATE POLICY "rate_limits_own_data" ON public.rate_limits
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================
-- DATA API GRANTS
-- Ab 2026-05-30 (neue Projekte) bzw. 2026-10-30 (bestehende Projekte)
-- exponiert Supabase Tabellen in "public" nicht mehr automatisch via
-- Data API (PostgREST). Explizite GRANTs sind erforderlich.
-- ============================================================

-- anon hat keinen Zugriff (alle API-Endpoints sind hinter requireAuth)
REVOKE ALL ON public.cv_profiles  FROM anon;
REVOKE ALL ON public.applications FROM anon;
REVOKE ALL ON public.job_cache    FROM anon;
REVOKE ALL ON public.rate_limits  FROM anon;

-- cv_profiles & applications: authenticated kann CRUD (gefiltert per RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_profiles  TO authenticated;
GRANT ALL                            ON public.cv_profiles  TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL                            ON public.applications TO service_role;

-- job_cache: authenticated nur lesen, schreiben via service_role
GRANT SELECT                         ON public.job_cache    TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_cache    TO service_role;

-- rate_limits: nur service_role (User gehen über die RPC)
GRANT ALL                            ON public.rate_limits  TO service_role;

-- ============================================================
-- INDIZES für Performance
-- ============================================================

CREATE INDEX idx_cv_profiles_user_id ON public.cv_profiles(user_id);
CREATE INDEX idx_applications_user_id ON public.applications(user_id);
CREATE INDEX idx_applications_created_at ON public.applications(created_at DESC);
CREATE INDEX idx_job_cache_hash ON public.job_cache(content_hash);
CREATE INDEX idx_job_cache_expires ON public.job_cache(expires_at);
CREATE INDEX idx_rate_limits_user_window ON public.rate_limits(user_id, action, window_start);

-- ============================================================
-- AUTOMATISCHES CV-PROFIL bei Registrierung
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.cv_profiles (user_id, language)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'language', 'de')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- ATOMISCHES RATE-LIMITING (verhindert Race Conditions)
-- Wird von der App via supabase.rpc() aufgerufen
-- ============================================================

-- Gibt die neue Anzahl zurück nach atomarem Increment.
-- Inkrementiert NUR wenn count < p_max; andernfalls -1.
CREATE OR REPLACE FUNCTION public.increment_rate_limit_if_allowed(
  p_user_id      UUID,
  p_action       TEXT,
  p_window_start TIMESTAMPTZ,
  p_max_count    INTEGER
) RETURNS INTEGER AS $$
DECLARE
  v_new_count INTEGER;
BEGIN
  -- Atomic INSERT ... ON CONFLICT DO UPDATE mit Bedingung
  WITH attempt AS (
    INSERT INTO public.rate_limits (user_id, action, window_start, count)
    VALUES (p_user_id, p_action, p_window_start, 1)
    ON CONFLICT (user_id, action, window_start)
    DO UPDATE
      SET count = rate_limits.count + 1
      WHERE rate_limits.count < p_max_count
    RETURNING count
  )
  SELECT count INTO v_new_count FROM attempt;

  IF v_new_count IS NULL THEN
    -- UPDATE-Bedingung nicht erfüllt → Limit bereits erreicht
    SELECT count INTO v_new_count FROM public.rate_limits
    WHERE user_id = p_user_id
      AND action = p_action
      AND window_start = p_window_start;
    RETURN -v_new_count; -- Negativ = abgelehnt
  END IF;

  RETURN v_new_count; -- Positiv = erlaubt
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

-- EXECUTE-Grant für die Rate-Limit-RPC (Data-API-konform)
GRANT EXECUTE ON FUNCTION public.increment_rate_limit_if_allowed(
  UUID, TEXT, TIMESTAMPTZ, INTEGER
) TO service_role;

-- ============================================================
-- CLEANUP CRONJOB (via pg_cron – in Supabase aktivierbar)
-- Löscht abgelaufene Job-Cache-Einträge täglich
-- ============================================================

-- SELECT cron.schedule(
--   'cleanup-job-cache',
--   '0 2 * * *',
--   'DELETE FROM public.job_cache WHERE expires_at < now()'
-- );

-- ============================================================
-- KOMMENTARE
-- ============================================================

COMMENT ON TABLE public.cv_profiles IS 'Gespeicherte CV-Daten pro Nutzer. Sensible Felder AES-256-GCM verschlüsselt.';
COMMENT ON TABLE public.job_cache IS 'Cache für geparste Stelleninserate. 24h TTL. Kein PII.';
COMMENT ON TABLE public.applications IS 'Bewerbungsverlauf pro Nutzer. Briefe AES-256-GCM verschlüsselt.';
COMMENT ON TABLE public.rate_limits IS 'Rate-Limiting für KI-API-Calls. Max 10/Stunde pro Nutzer.';


-- Server-only function execution and counter writes.
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


-- PoC privacy, global AI budget and operational cleanup.

-- 20261011113020_poc_safety_and_ai_budget.sql
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

-- 20261011114853_schedule_poc_cleanup.sql
-- Database-native cleanup: no public maintenance route or additional secrets.
-- PGlite does not ship pg_cron; isolated checks test the cleanup function itself.
DO $install$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pg_cron') THEN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    REVOKE ALL ON SCHEMA cron FROM PUBLIC, anon, authenticated;
    EXECUTE $schedule$
      SELECT cron.schedule('bewerbungsboost-poc-cleanup', '17 2 * * *',
        $job$SELECT public.cleanup_poc_operational_data();
        DELETE FROM cron.job_run_details
          WHERE jobid IN (SELECT jobid FROM cron.job WHERE jobname = 'bewerbungsboost-poc-cleanup')
          AND end_time < now() - interval '7 days';$job$)
    $schedule$;
  END IF;
END;
$install$;
