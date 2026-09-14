# Supabase Cron: GLPM livescores (30s, CEST windows)

Replaces cron-job.org minute polling for `/api/cron/glpm-livescores`.

## Windows (Europe/Berlin)

| Days | Local window |
|------|----------------|
| Fri - Sun | 12:00 - 23:30 |
| Mon - Thu | 18:00 - 23:30 |

Outside these windows the SQL function returns without calling Vercel (Hobby-safe).

## One-time setup (project `gvpdyngcbpxyuirqkurs`)

1. Apply migration `055_glpm_livescores_supabase_cron.sql` (SQL editor or CLI).
2. Dashboard → **Integrations → Cron** (ensure Cron / `pg_cron` is enabled).
3. Enable **`pg_net`** if not already on.
4. Store secrets in Vault (SQL editor):

```sql
select vault.create_secret('https://YOUR_PRODUCTION_ORIGIN', 'app_url');
select vault.create_secret('YOUR_SYNC_CRON_SECRET_OR_CRON_SECRET', 'cron_secret');
```

Use the same value as `SYNC_CRON_SECRET` / `CRON_SECRET` on Vercel.

5. Activate the job:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'glpm-livescores-30s'),
  active := true
);
```

6. Smoke test inside a window (or temporarily force):

```sql
select public.glpm_invoke_livescores_cron();
select * from net._http_response order by created desc limit 5;
select * from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'glpm-livescores-30s')
order by start_time desc
limit 10;
```

## After one clean match week

1. Delete the cron-job.org livescores jobs.
2. GitHub Action `glpm-livescores.yml` is workflow_dispatch-only (manual smoke). Scheduled polls are removed.
3. Vercel no longer schedules daily livescores (removed from `vercel.json`).

## Fallback

If Hobby Active CPU climbs, switch schedule to every minute:

```sql
select cron.alter_job(
  job_id := (select jobid from cron.job where jobname = 'glpm-livescores-30s'),
  schedule := '* * * * *'
);
```
