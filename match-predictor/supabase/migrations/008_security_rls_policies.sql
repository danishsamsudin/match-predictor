-- Lock down rls_auto_enable (Supabase helper; not for PostgREST RPC).
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM anon;
REVOKE ALL ON FUNCTION public.rls_auto_enable() FROM authenticated;

-- Explicit deny policies for backend-only tables (service role bypasses RLS).
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

    pol_name := tbl || '_no_public_access';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        pol_name,
        tbl
      );
    END IF;
  END LOOP;
END $$;
