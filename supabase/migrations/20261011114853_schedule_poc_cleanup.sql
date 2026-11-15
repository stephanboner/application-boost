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
