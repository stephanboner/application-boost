// Isolated PostgreSQL validation. No network, credentials, or production data.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";

const db = new PGlite();
try {
  await db.exec(`
    CREATE SCHEMA auth;
    CREATE ROLE anon;
    CREATE ROLE authenticated;
    CREATE ROLE service_role BYPASSRLS;
    CREATE TABLE auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      raw_user_meta_data jsonb DEFAULT '{}'
    );
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS
      $$ SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS
      $$ SELECT current_user::text $$;
    GRANT USAGE ON SCHEMA auth, public TO anon, authenticated, service_role;
  `);

  // Simulate the deployed pre-hardening schema and Supabase's legacy grants.
  // gen_random_uuid is built in; PGlite does not need the pgcrypto extension.
  const schema = readFileSync(new URL("../supabase/schema.sql", import.meta.url), "utf8")
    .split("\n-- Server-only function execution")[0]
    .replace('CREATE EXTENSION IF NOT EXISTS "pgcrypto";', "")
    .replaceAll(" SET search_path = ''", "");
  await db.exec(schema);
  await db.exec("GRANT ALL ON public.rate_limits TO anon, authenticated");
  const migration = readFileSync(new URL(
    "../supabase/migrations/20261009121000_harden_database_functions.sql", import.meta.url
  ), "utf8");
  await db.exec(migration);
  await db.exec(migration); // Must also be safe to reapply.
  for (const filename of ["20261011113020_poc_safety_and_ai_budget.sql", "20261011114853_schedule_poc_cleanup.sql"]) {
    const sql = readFileSync(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
    await db.exec(sql);
    await db.exec(sql);
  }

  const acl = await db.query(`
    SELECT p.proname,
      has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_execute,
      has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_execute,
      has_function_privilege('service_role', p.oid, 'EXECUTE') AS service_execute,
      p.proconfig
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname IN
      ('handle_new_user','update_updated_at','increment_rate_limit_if_allowed');
  `);
  assert.equal(acl.rows.length, 3);
  for (const row of acl.rows) {
    assert.equal(row.anon_execute, false);
    assert.equal(row.authenticated_execute, false);
    assert.ok(row.proconfig.some(value => value.startsWith("search_path=")));
    if (row.proname === "increment_rate_limit_if_allowed") assert.equal(row.service_execute, true);
  }

  const { rows: users } = await db.query("INSERT INTO auth.users DEFAULT VALUES RETURNING id");
  const userId = users[0].id;
  const { rows: otherUsers } = await db.query("INSERT INTO auth.users DEFAULT VALUES RETURNING id");
  const otherId = otherUsers[0].id;
  const profile = await db.query("SELECT language FROM public.cv_profiles WHERE user_id=$1", [userId]);
  assert.equal(profile.rows[0].language, "de");

  await db.exec("SET ROLE authenticated");
  await db.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
  await db.query("UPDATE public.cv_profiles SET language='fr' WHERE user_id=$1", [userId]);
  const ownRows = await db.query("SELECT user_id, language FROM public.cv_profiles");
  assert.equal(ownRows.rows.length, 1);
  assert.equal(ownRows.rows[0].language, "fr");
  const otherUpdate = await db.query("UPDATE public.cv_profiles SET language='it' WHERE user_id=$1 RETURNING id", [otherId]);
  assert.equal(otherUpdate.rows.length, 0);
  await assert.rejects(db.query("INSERT INTO public.rate_limits (user_id, window_start) VALUES ($1, now())", [userId]), /permission denied/i);
  await assert.rejects(db.query("SELECT public.increment_rate_limit_if_allowed($1, 'generate', now(), 2)", [userId]), /permission denied/i);
  for (const sql of ["SELECT * FROM public.job_cache", "SELECT * FROM public.ai_usage_daily",
    "SELECT public.reserve_ai_quota(10, 2, 100)", "SELECT public.cleanup_poc_operational_data()"])
    await assert.rejects(db.query(sql), /permission denied/i);
  await assert.rejects(db.query("SELECT public.delete_user_poc_data($1)", [otherId]), /permission denied/i);
  await db.exec("RESET ROLE; SET ROLE anon");
  await assert.rejects(db.query("SELECT public.increment_rate_limit_if_allowed($1, 'generate', now(), 2)", [userId]), /permission denied/i);

  await db.exec("RESET ROLE; SET ROLE service_role");
  // Keep the rate-limit fixture recent so the cleanup assertion is independent of the calendar date.
  const recentRateWindow = new Date().toISOString();
  for (const expected of [1, 2, -2, -2]) {
    const result = await db.query("SELECT public.increment_rate_limit_if_allowed($1, 'generate', $2::timestamptz, 2) AS count", [userId, recentRateWindow]);
    assert.equal(result.rows[0].count, expected);
  }
  for (const expected of [true, true, false, false]) {
    assert.equal((await db.query("SELECT public.reserve_ai_quota(40, 2, 100) AS allowed")).rows[0].allowed, expected);
  }
  const budget = await db.query("SELECT calls, reserved_tokens::integer AS tokens FROM public.ai_usage_daily");
  assert.deepEqual(budget.rows, [{ calls: 2, tokens: 80 }]);
  assert.equal((await db.query("SELECT public.reserve_ai_quota(21, 100, 100) AS allowed")).rows[0].allowed, false);
  await assert.rejects(db.query("SELECT public.reserve_ai_quota(-1, 100, 100)"), /Invalid quota/i);

  await db.query("INSERT INTO public.job_cache(content_hash,parsed_json,source_type,user_id,expires_at) VALUES ('expired','{}','url',$1,now()-interval '2 days'),('live','{}','url',$1,now()+interval '1 day'),('other','{}','url',$2,now()+interval '1 day')", [userId, otherId]);
  await db.query("INSERT INTO public.rate_limits(user_id,action,window_start) VALUES ($1,'old',now()-interval '8 days'),($1,'new',now())", [userId]);
  await db.query("INSERT INTO public.applications(user_id,job_title,letter_enc) VALUES ($1,'My job','encrypted-first'),($2,'Other job','encrypted-other')", [userId, otherId]);
  const cleaned = (await db.query("SELECT public.cleanup_poc_operational_data() AS counts")).rows[0].counts;
  assert.equal(cleaned.cache, 1);
  assert.equal(cleaned.rate_limits, 1);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.applications")).rows[0].count, 2);

  // Restore an actual isolated PostgreSQL archive into a second instance.
  // Ciphertext, RLS and function grants must survive, without production data.
  const snapshot = (await db.query("SELECT user_id,letter_enc FROM public.applications ORDER BY user_id")).rows;
  await db.exec("RESET ROLE");
  const archive = await db.dumpDataDir();
  const restored = new PGlite({ loadDataDir: archive });
  try {
    assert.deepEqual((await restored.query("SELECT user_id,letter_enc FROM public.applications ORDER BY user_id")).rows, snapshot);
    assert.equal((await restored.query("SELECT count(*)::integer AS count FROM public.cv_profiles")).rows[0].count, 2);
    assert.equal((await restored.query("SELECT has_function_privilege('authenticated', 'public.delete_user_poc_data(uuid)', 'EXECUTE') AS allowed")).rows[0].allowed, false);
    await restored.exec("SET ROLE authenticated");
    await restored.query("SELECT set_config('request.jwt.claim.sub', $1, false)", [userId]);
    assert.equal((await restored.query("SELECT count(*)::integer AS count FROM public.cv_profiles")).rows[0].count, 1);
  } finally { await restored.close(); }
  await db.exec("SET ROLE service_role");

  await db.query("SELECT public.delete_user_poc_data($1)", [userId]);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.applications WHERE user_id=$1", [userId])).rows[0].count, 0);
  assert.equal((await db.query("SELECT letter_enc FROM public.applications WHERE user_id=$1", [otherId])).rows[0].letter_enc, "encrypted-other");
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.job_cache WHERE user_id=$1", [userId])).rows[0].count, 0);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.cv_profiles WHERE user_id=$1", [otherId])).rows[0].count, 1);
  await db.exec("RESET ROLE");
  await db.query("DELETE FROM auth.users WHERE id IN ($1, $2)", [userId, otherId]);
  assert.equal((await db.query("SELECT count(*)::integer AS count FROM public.cv_profiles")).rows[0].count, 0);
  console.log("PASS: triggers/RLS, denied client cache/budget/RPC access, atomic per-user/global quotas, bounded operational cleanup, archive restore, isolated user deletion, cascade cleanup and migration reapplication.");
} finally {
  await db.close();
}
