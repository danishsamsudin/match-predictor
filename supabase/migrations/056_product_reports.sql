-- Product reports catalog (Storage objects referenced by path). Service-role writes; no public SELECT.

BEGIN;

CREATE TABLE IF NOT EXISTS product_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL
    CHECK (kind IN ('glpm-league-run', 'wc-post-match')),
  title TEXT NOT NULL,
  season_id BIGINT,
  competition_name TEXT,
  summary TEXT,
  storage_path_md TEXT,
  storage_path_pdf TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_reports_created_at_idx
  ON product_reports (created_at DESC);

CREATE INDEX IF NOT EXISTS product_reports_kind_idx
  ON product_reports (kind, created_at DESC);

ALTER TABLE product_reports ENABLE ROW LEVEL SECURITY;

-- Custom app auth uses service role on the server; deny anon/authenticated direct access.
DROP POLICY IF EXISTS "product_reports_no_public_access" ON product_reports;
CREATE POLICY "product_reports_no_public_access"
  ON product_reports
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

COMMIT;
