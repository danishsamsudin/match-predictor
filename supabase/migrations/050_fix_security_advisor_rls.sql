-- match-predictor: fix Security Advisor RLS findings
-- Project: gvpdyngcbpxyuirqkurs
--
-- Typical advisor issues this addresses:
--   1) rls_enabled_no_policy  - RLS on, but zero policies
--   2) rls_disabled_in_public - public tables without RLS
--
-- Idempotent. Safe to re-run.
-- Paste into: Supabase Dashboard -> SQL Editor -> Run
-- Then: Advisors -> Security -> Rerun linter

-- ---------------------------------------------------------------------------
-- Optional diagnostic (run alone first if you want to see what is flagged)
-- ---------------------------------------------------------------------------
-- SELECT c.relname AS table_name,
--        c.relrowsecurity AS rls_enabled,
--        COUNT(p.policyname) AS policy_count
-- FROM pg_class c
-- JOIN pg_namespace n ON n.oid = c.relnamespace
-- LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
-- WHERE n.nspname = 'public' AND c.relkind = 'r'
-- GROUP BY c.relname, c.relrowsecurity
-- HAVING c.relrowsecurity = false
--     OR (c.relrowsecurity = true AND COUNT(p.policyname) = 0)
-- ORDER BY c.relrowsecurity, c.relname;

-- ---------------------------------------------------------------------------
-- 1) RLS enabled but no policy -> add explicit deny (service_role still bypasses)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  pol_name text;
  deny_tables text[] := ARRAY[
    'waitlist_signups',        -- email PII; API uses service role only
    'glpm_daily_sync_windows'  -- internal cron scheduling state
  ];
BEGIN
  FOREACH tbl IN ARRAY deny_tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    pol_name := tbl || '_no_public_access';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        pol_name,
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 2) Public catalog tables: enable RLS + SELECT for anon/authenticated
--    (writes stay service-role-only)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  pol_name text;
  read_tables text[] := ARRAY[
    -- missing RLS entirely (advisor: rls_disabled_in_public)
    'glpm_prediction_history',
    'glpm_standings_current',
    'glpm_standings_snapshots',
    'glpm_understat_team_season',
    'glpm_understat_player_season',
    'glpm_venues',
    -- RLS on but no policy (advisor: rls_enabled_no_policy); public read like FBref tables
    'team_formation_usage'
  ];
BEGIN
  FOREACH tbl IN ARRAY read_tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    pol_name := tbl || '_select';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        pol_name,
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- 3) Belt-and-braces: ensure backend deny policies from migration 008 still exist
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  tbl text;
  pol_name text;
  tables text[] := ARRAY[
    'api_cache',
    'api_usage_daily',
    'data_sync_runs',
    'data_sync_state',
    'football_api_call_log',
    'football_api_daily',
    'predictions_log',
    'stadium_profiles',
    'synced_api_payloads',
    'synced_event_h2h',
    'synced_event_incidents',
    'synced_event_lineups',
    'synced_event_statistics',
    'synced_match_bundles',
    'synced_seasons',
    'synced_standings',
    'synced_team_statistics',
    'synced_tournaments',
    'synced_weather'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', tbl);

    pol_name := tbl || '_no_public_access';
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = tbl AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        pol_name,
        tbl
      );
    END IF;
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- Verification
-- ---------------------------------------------------------------------------
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       COUNT(p.policyname) AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
LEFT JOIN pg_policies p ON p.schemaname = n.nspname AND p.tablename = c.relname
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'waitlist_signups',
    'glpm_daily_sync_windows',
    'team_formation_usage',
    'glpm_prediction_history',
    'glpm_standings_current',
    'glpm_standings_snapshots',
    'glpm_understat_team_season',
    'glpm_understat_player_season',
    'glpm_venues'
  )
GROUP BY c.relname, c.relrowsecurity
ORDER BY c.relname;
