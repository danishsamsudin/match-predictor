-- GLPM livescores: Supabase Cron (30s) + Europe/Berlin match windows.
-- Job is created INACTIVE until Vault secrets app_url + cron_secret exist.
-- See docs/SUPABASE_CRON_LIVESCORES.md
-- Migration: 055_glpm_livescores_supabase_cron.sql

BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

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

CREATE OR REPLACE FUNCTION public.glpm_invoke_livescores_cron()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  app_url text;
  cron_secret text;
  request_id bigint;
BEGIN
  IF NOT public.glpm_livescores_in_poll_window(now()) THEN
    RETURN NULL;
  END IF;

  SELECT decrypted_secret INTO app_url
  FROM vault.decrypted_secrets
  WHERE name = 'app_url'
  LIMIT 1;

  SELECT decrypted_secret INTO cron_secret
  FROM vault.decrypted_secrets
  WHERE name = 'cron_secret'
  LIMIT 1;

  IF app_url IS NULL OR btrim(app_url) = '' OR cron_secret IS NULL OR btrim(cron_secret) = '' THEN
    RAISE WARNING 'glpm_invoke_livescores_cron: missing vault secrets app_url and/or cron_secret';
    RETURN NULL;
  END IF;

  app_url := rtrim(app_url, '/');

  SELECT net.http_post(
    url := app_url || '/api/cron/glpm-livescores?run=true',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || cron_secret,
      'Accept', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  )
  INTO request_id;

  RETURN request_id;
END;
$$;

-- Cron-only: revoke Data API access (anon/authenticated default EXECUTE grants).
REVOKE ALL ON FUNCTION public.glpm_livescores_in_poll_window(timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.glpm_livescores_in_poll_window(timestamptz) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.glpm_invoke_livescores_cron() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.glpm_invoke_livescores_cron() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.glpm_livescores_in_poll_window(timestamptz) TO postgres;
GRANT EXECUTE ON FUNCTION public.glpm_invoke_livescores_cron() TO postgres;

-- Upsert schedule (inactive until activated in runbook after Vault secrets).
DO $$
DECLARE
  existing_jobid bigint;
BEGIN
  SELECT jobid INTO existing_jobid
  FROM cron.job
  WHERE jobname = 'glpm-livescores-30s'
  LIMIT 1;

  IF existing_jobid IS NULL THEN
    PERFORM cron.schedule(
      'glpm-livescores-30s',
      '30 seconds',
      $cron$SELECT public.glpm_invoke_livescores_cron();$cron$
    );
    SELECT jobid INTO existing_jobid
    FROM cron.job
    WHERE jobname = 'glpm-livescores-30s'
    LIMIT 1;
  END IF;

  IF existing_jobid IS NOT NULL THEN
    PERFORM cron.alter_job(existing_jobid, active := false);
  END IF;
END $$;

COMMIT;
