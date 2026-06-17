#!/usr/bin/env bash
# Recompute World Cup hub predictions (requires dev server + Supabase env).
# Usage: bash scripts/wc-sync.sh
#   BASE_URL=http://localhost:3000 bash scripts/wc-sync.sh

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

BASE_URL="${BASE_URL:-http://localhost:3000}"
SECRET="${SYNC_CRON_SECRET:-${CRON_SECRET:-}}"

if [[ -z "$SECRET" ]]; then
  echo "Missing SYNC_CRON_SECRET (or CRON_SECRET) in .env.local" >&2
  echo "Add the same value you use for POST /api/cron/sync, then retry." >&2
  exit 1
fi

echo "==> World Cup hub sync (${BASE_URL})"
curl -sS -f -X POST "${BASE_URL}/api/cron/world-cup?run=true" \
  -H "Authorization: Bearer ${SECRET}"
echo ""
