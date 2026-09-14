-- Remediate Security Advisor findings from migrations 055 + 056:
--   1) function_search_path_mutable on glpm_livescores_in_poll_window
--   2) anon/authenticated EXECUTE on SECURITY DEFINER glpm_invoke_livescores_cron
--   3) rls_enabled_no_policy on product_reports
-- Idempotent. Safe to re-run.
-- Project: gvpdyngcbpxyuirqkurs (SQL editor or `supabase db push` once linked)

BEGIN;

-- 1) Pin search_path (advisor: function_search_path_mutable)
CREATE OR REPLACE FUNCTION public.glpm_livescores_in_poll_window(ts timestamptz DEFAULT now())
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  WITH local AS (
    SELECT
      EXTRACT(DOW FROM timezone('Europe/Berlin', ts))::int AS dow,
      EXTRACT(HOUR FROM timezone('Europe/Berlin', ts))::int AS hour,
      EXTRACT(MINUTE FROM timezone('Europe/Berlin', ts))::int AS minute
  )
  SELECT
    CASE
      -- Fri(5) Sat(6) Sun(0): 12:00 - 23:30 Europe/Berlin
      WHEN l.dow IN (0, 5, 6)
        AND (
          (l.hour > 12 AND l.hour < 23)
          OR (l.hour = 12 AND l.minute >= 0)
          OR (l.hour = 23 AND l.minute <= 30)
        )
      THEN true
      -- Mon-Thu (1-4): 18:00 - 23:30 Europe/Berlin
      WHEN l.dow BETWEEN 1 AND 4
        AND (
          (l.hour > 18 AND l.hour < 23)
          OR (l.hour = 18 AND l.minute >= 0)
          OR (l.hour = 23 AND l.minute <= 30)
        )
      THEN true
      ELSE false
    END
  FROM local l;
$$;

-- 2) Cron-only EXECUTE: revoke Data API roles (advisor: *_security_definer_function_executable)
-- KEEP SECURITY DEFINER on glpm_invoke_livescores_cron (Vault + net.http_post); do not expose via /rest/v1/rpc.
REVOKE ALL ON FUNCTION public.glpm_livescores_in_poll_window(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.glpm_livescores_in_poll_window(timestamptz) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.glpm_livescores_in_poll_window(timestamptz) TO postgres;

DO $$
BEGIN
  IF to_regprocedure('public.glpm_invoke_livescores_cron()') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.glpm_invoke_livescores_cron() FROM PUBLIC';
    EXECUTE 'REVOKE ALL ON FUNCTION public.glpm_invoke_livescores_cron() FROM anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.glpm_invoke_livescores_cron() TO postgres';
  END IF;
END $$;

-- 3) Explicit deny policy (advisor: rls_enabled_no_policy). Service role bypasses RLS.
DO $$
BEGIN
  IF to_regclass('public.product_reports') IS NULL THEN
    RAISE NOTICE '059: public.product_reports missing; skip RLS policy';
    RETURN;
  END IF;

  EXECUTE 'ALTER TABLE public.product_reports ENABLE ROW LEVEL SECURITY';
  EXECUTE 'DROP POLICY IF EXISTS "product_reports_deny_all" ON public.product_reports';
  EXECUTE 'DROP POLICY IF EXISTS "product_reports_no_public_access" ON public.product_reports';
  EXECUTE $pol$
    CREATE POLICY "product_reports_no_public_access"
      ON public.product_reports
      FOR ALL
      TO anon, authenticated
      USING (false)
      WITH CHECK (false)
  $pol$;
END $$;

COMMIT;
