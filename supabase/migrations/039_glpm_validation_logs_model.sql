-- Expand glpm_validation_logs for Chapter 13 model validation / backtesting (layer VAL).
-- Existing L1/L2 ingest QA rows are unchanged.

ALTER TABLE glpm_validation_logs
  DROP CONSTRAINT IF EXISTS glpm_validation_logs_layer_check;

ALTER TABLE glpm_validation_logs
  ADD CONSTRAINT glpm_validation_logs_layer_check
  CHECK (layer IN ('L1', 'L2', 'VAL'));

ALTER TABLE glpm_validation_logs
  DROP CONSTRAINT IF EXISTS glpm_validation_logs_severity_check;

ALTER TABLE glpm_validation_logs
  ADD CONSTRAINT glpm_validation_logs_severity_check
  CHECK (severity IN ('error', 'warn', 'info'));

COMMENT ON TABLE glpm_validation_logs IS
  'L1/L2 ingest QA plus VAL model-validation / backtest metrics (Chapter 2.14 / Chapter 13).';

CREATE INDEX IF NOT EXISTS idx_glpm_validation_logs_layer
  ON glpm_validation_logs (layer, created_at DESC);
