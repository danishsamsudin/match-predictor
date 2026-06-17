-- Allow read-only access to FBref World Cup tables for local app / anon key (SELECT only).

DO $$
DECLARE
  tbl text;
  pol_name text;
  tables text[] := ARRAY[
    'teams',
    'managers',
    'matches',
    'players',
    'lineups',
    'player_season_stats'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables
  LOOP
    IF to_regclass('public.' || tbl) IS NULL THEN
      CONTINUE;
    END IF;

    pol_name := tbl || '_select_public';

    IF NOT EXISTS (
      SELECT 1
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename = tbl
        AND policyname = pol_name
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO anon, authenticated USING (true)',
        pol_name,
        tbl
      );
    END IF;
  END LOOP;
END $$;
