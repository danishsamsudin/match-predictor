-- Allow The Odds API responses in shared api_cache / daily usage counters.
ALTER TABLE api_cache DROP CONSTRAINT IF EXISTS api_cache_provider_check;
ALTER TABLE api_cache
  ADD CONSTRAINT api_cache_provider_check
  CHECK (provider IN ('football', 'weather', 'odds'));

ALTER TABLE api_usage_daily DROP CONSTRAINT IF EXISTS api_usage_daily_provider_check;
ALTER TABLE api_usage_daily
  ADD CONSTRAINT api_usage_daily_provider_check
  CHECK (provider IN ('football', 'weather', 'odds'));
