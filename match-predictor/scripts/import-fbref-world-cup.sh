#!/usr/bin/env bash
# Import World Cup 2026 fixtures from saved FBref HTML into Supabase.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

export SUPABASE_URL="${SUPABASE_URL:-${NEXT_PUBLIC_SUPABASE_URL:-}}"
export SUPABASE_KEY="${SUPABASE_KEY:-${SUPABASE_SERVICE_ROLE_KEY:-}}"

exec python3 scripts/import_fbref_world_cup_local.py "$@"
