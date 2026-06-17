#!/usr/bin/env bash
# Import Scoutlyst CSV exports into Supabase.
# 1. Export CSV from Scoutlyst
# 2. Drop file(s) into data/imports/scoutlyst/incoming/
# 3. Run: bash scripts/scoutlyst-import.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
INCOMING="${ROOT}/data/imports/scoutlyst/incoming"
BASE_URL="${BASE_URL:-http://localhost:3000}"
SYNC_CRON_SECRET="${SYNC_CRON_SECRET:-}"

if [[ -z "${SYNC_CRON_SECRET}" ]]; then
  if [[ -f "${ROOT}/.env.local" ]]; then
    SYNC_CRON_SECRET="$(grep -E '^SYNC_CRON_SECRET=' "${ROOT}/.env.local" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")"
  fi
fi

echo "==> Pending import (preview)"
curl -sS "${BASE_URL}/api/cron/scoutlyst-import" \
  ${SYNC_CRON_SECRET:+-H "Authorization: Bearer ${SYNC_CRON_SECRET}"} | tee /tmp/scoutlyst-pending.json
echo ""

pending="$(node -e "const j=require('/tmp/scoutlyst-pending.json'); process.stdout.write(String(j.pendingCount??0))" 2>/dev/null || echo 0)"
if [[ "${pending}" == "0" ]]; then
  echo "No CSV files under ${INCOMING} (use incoming/<league-folder>/*.csv)"
  exit 1
fi

echo "==> Importing ${pending} file(s) via ${BASE_URL}/api/cron/scoutlyst-import"
curl -sS -X POST "${BASE_URL}/api/cron/scoutlyst-import" \
  ${SYNC_CRON_SECRET:+-H "Authorization: Bearer ${SYNC_CRON_SECRET}"} | tee /tmp/scoutlyst-import.json
echo ""
echo "Done. Archived files live in data/imports/scoutlyst/archive/"
