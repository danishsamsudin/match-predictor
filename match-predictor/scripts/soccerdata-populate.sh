#!/usr/bin/env bash
# Copy-paste friendly SoccerData + RapidAPI population script.
# Edit the variables below, then: bash scripts/soccerdata-populate.sh

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SYNC_CRON_SECRET="${SYNC_CRON_SECRET:-YOUR_SYNC_CRON_SECRET}"
LEAGUE_ID="${LEAGUE_ID:-39}"
SEASON="${SEASON:-2025}"

echo "==> 1) RapidAPI / SofaScore sync (canonical teams + events)"
curl -sS -X POST "${BASE_URL}/api/cron/sync?force=true" \
  -H "Authorization: Bearer ${SYNC_CRON_SECRET}" | tee /tmp/cron-sync.json
echo ""

echo "==> 2) SoccerData one-shot league backfill"
if [[ -z "${SYNC_CRON_SECRET}" || "${SYNC_CRON_SECRET}" == "YOUR_SYNC_CRON_SECRET" ]]; then
  echo "Set SYNC_CRON_SECRET in .env.local (required when app login is enabled)."
  exit 1
fi
curl -sS -X POST "${BASE_URL}/api/soccerdata/import/backfill" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${SYNC_CRON_SECRET}" \
  -d "{\"leagueId\":${LEAGUE_ID},\"season\":${SEASON}}" | tee /tmp/soccerdata-backfill.json
echo ""

echo "Done. See docs/SOCCERDATA_POPULATE_COMMANDS.md for individual steps and SQL checks."
