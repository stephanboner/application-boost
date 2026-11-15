-- ============================================================
-- BewerbungsBoost — Data API Grants
-- ============================================================
--
-- Kontext: Supabase ändert ab 2026-05-30 (neue Projekte) bzw. 2026-10-30
-- (bestehende Projekte) das Default-Verhalten: Tabellen in "public" sind
-- nicht mehr automatisch über die Data API (PostgREST/supabase-js)
-- zugänglich. Es braucht explizite GRANTs pro Rolle.
--
-- Unsere bestehenden Tabellen behalten ihre aktuellen Grants — diese
-- Migration macht sie aber EXPLIZIT, damit:
--   1. Das Schema beim erneuten Anlegen (z.B. Staging-Environment) korrekt
--      funktioniert, auch nach dem 2026-05-30.
--   2. Defense-in-depth: explizit > implizit.
--   3. Künftige Tabellen-Migrationen das Muster übernehmen können.
--
-- Idempotent: kann mehrfach ausgeführt werden, ohne zu zerstören.
-- ============================================================

BEGIN;

-- ── 1) Vorbedingung: anon hat KEINEN Zugriff auf User-Daten ──
--    Wir haben keine öffentlichen Tabellen. Alle API-Endpoints sind
--    hinter requireAuth(). Falls anon je etwas hatte, hier sicherstellen.
REVOKE ALL ON public.cv_profiles  FROM anon;
REVOKE ALL ON public.applications FROM anon;
REVOKE ALL ON public.job_cache    FROM anon;
REVOKE ALL ON public.rate_limits  FROM anon;

-- ── 2) cv_profiles ──
--    Nutzer lesen/schreiben ihren eigenen CV (gefiltert per RLS).
--    Service-Role für Server-Side-Operationen (z.B. /api/cv).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cv_profiles TO authenticated;
GRANT ALL                            ON public.cv_profiles TO service_role;

-- ── 3) applications ──
--    Nutzer lesen/schreiben ihre eigenen Bewerbungen (gefiltert per RLS).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL                            ON public.applications TO service_role;

-- ── 4) job_cache ──
--    Nutzer dürfen lesen (Cache-Hits sparen API-Calls); Schreiben nur
--    über Service-Role (siehe /api/parse-job).
GRANT SELECT                          ON public.job_cache TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE  ON public.job_cache TO service_role;

-- ── 5) rate_limits ──
--    Keine direkten Reads/Writes durch User. Increment läuft über die
--    RPC-Function increment_rate_limit_if_allowed() (SECURITY DEFINER).
GRANT ALL ON public.rate_limits TO service_role;

-- ── 6) RPC: increment_rate_limit_if_allowed ──
--    Auch Functions brauchen EXECUTE-Grants (gleiche Logik wie Tabellen).
--    Die Function ist SECURITY DEFINER, läuft also mit den Rechten des
--    Owners — aber EXECUTE-Recht muss explizit gegeben sein.
GRANT EXECUTE ON FUNCTION public.increment_rate_limit_if_allowed(
  UUID, TEXT, TIMESTAMPTZ, INTEGER
) TO service_role;

-- ── 7) Sequences (für SERIAL/IDENTITY-Spalten) ──
--    Unsere Tabellen nutzen UUID-PKs, also keine Sequences relevant.
--    Falls künftig SERIAL hinzukommt: GRANT USAGE ON SEQUENCE ... TO authenticated.

COMMIT;

-- ============================================================
-- Verifikation (manuell im SQL Editor ausführbar)
-- ============================================================
-- Prüft, welche Grants pro Tabelle vergeben sind:
--
--   SELECT grantee, table_name, privilege_type
--   FROM information_schema.role_table_grants
--   WHERE table_schema = 'public'
--     AND grantee IN ('anon', 'authenticated', 'service_role')
--   ORDER BY table_name, grantee, privilege_type;
