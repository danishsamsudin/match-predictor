#!/usr/bin/env bash
# One-shot local data refresh: RapidAPI sync → SofaScore deep seed → stats → SoccerData → lineups.
#
# Usage (from anywhere):
#   cd match-predictor/match-predictor && npm run data:refresh
#
# Optional env overrides:
#   BASE_URL=http://localhost:3000
#   SKIP_INSTALL=1          skip pip installs
#   SKIP_DEV_SERVER=1       fail if dev server is not already up
#   SKIP_SYNC=1             skip POST /api/cron/sync
#   SKIP_SEED=1             skip seed_database.py
#   SKIP_STATS=1            skip backfill_event_statistics.py
#   SKIP_SOCCERDATA=1       skip SoccerData import/backfill
#   SKIP_LINEUPS=1          skip lineup backfill
#   STATS_MAX=0             0 = all missing stats; e.g. 500 for a capped batch
#   SOCCERDATA_LEAGUES=39   comma-separated league ids for SoccerData backfill
#   SOCCERDATA_SEASON=2025
#   LINEUP_LEAGUE=39
#   LINEUP_LIMIT=40

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
SYNC_CRON_SECRET="${SYNC_CRON_SECRET:-${CRON_SECRET:-}}"
STATS_MAX="${STATS_MAX:-0}"
SOCCERDATA_LEAGUES="${SOCCERDATA_LEAGUES:-${LEAGUE_ID:-39}}"
SOCCERDATA_SEASON="${SOCCERDATA_SEASON:-${SEASON:-2025}}"
LINEUP_LEAGUE="${LINEUP_LEAGUE:-39}"
LINEUP_LIMIT="${LINEUP_LIMIT:-40}"

DEV_PID=""
STARTED_DEV=0

cleanup() {
  if [[ "${STARTED_DEV}" == "1" && -n "${DEV_PID}" ]]; then
    echo ""
    echo "==> Stopping dev server (pid ${DEV_PID})"
    kill "${DEV_PID}" 2>/dev/null || true
    wait "${DEV_PID}" 2>/dev/null || true
  fi
}
trap cleanup EXIT INT TERM

step() {
  echo ""
  echo "======================================================================"
  echo "==> $*"
  echo "======================================================================"
}

ensure_python_deps() {
  step "Installing Python dependencies"
  python3 -m pip install -q curl_cffi supabase
  python3 -m pip install -q -r services/soccerdata/requirements.txt
}

ensure_dev_server() {
  if curl -sf "${BASE_URL}/api/football/status" >/dev/null 2>&1; then
    echo "Dev server already running at ${BASE_URL}"
    return 0
  fi

  if [[ "${SKIP_DEV_SERVER:-}" == "1" ]]; then
    echo "Dev server is not running at ${BASE_URL} and SKIP_DEV_SERVER=1." >&2
    exit 1
  fi

  step "Starting dev server (${BASE_URL})"
  npm run dev >/tmp/match-predictor-dev.log 2>&1 &
  DEV_PID=$!
  STARTED_DEV=1

  for _ in $(seq 1 45); do
    if curl -sf "${BASE_URL}/api/football/status" >/dev/null 2>&1; then
      echo "Dev server ready."
      return 0
    fi
    sleep 2
  done

  echo "Dev server failed to start within 90s. Log: /tmp/match-predictor-dev.log" >&2
  tail -20 /tmp/match-predictor-dev.log >&2 || true
  exit 1
}

run_cron_sync() {
  if [[ -z "${SYNC_CRON_SECRET}" ]]; then
    echo "Missing SYNC_CRON_SECRET (or CRON_SECRET) in .env.local — skipping RapidAPI sync." >&2
    return 0
  fi

  step "RapidAPI / SofaScore sync (canonical teams + events)"
  curl -sS -X POST "${BASE_URL}/api/cron/sync?force=true" \
    -H "Authorization: Bearer ${SYNC_CRON_SECRET}" | tee /tmp/cron-sync.json
  echo ""
}

run_seed_sofascore() {
  step "SofaScore deep seed (fixtures, events, team statistics)"
  python3 seed_database.py
}

run_stats_backfill() {
  step "SofaScore per-match statistics backfill (max=${STATS_MAX:-0})"
  python3 scripts/backfill_event_statistics.py platform "${STATS_MAX}"
}

run_soccerdata_backfill() {
  step "SoccerData enrichment backfill (leagues=${SOCCERDATA_LEAGUES}, season=${SOCCERDATA_SEASON})"
  IFS=',' read -r -a leagues <<< "${SOCCERDATA_LEAGUES}"
  for league_id in "${leagues[@]}"; do
    league_id="$(echo "${league_id}" | tr -d ' ')"
    [[ -z "${league_id}" ]] && continue
    echo "--- league ${league_id} ---"
    curl -sS -X POST "${BASE_URL}/api/soccerdata/import/backfill" \
      -H "Content-Type: application/json" \
      -d "{\"leagueId\":${league_id},\"season\":${SOCCERDATA_SEASON}}" \
      | tee "/tmp/soccerdata-backfill-${league_id}.json"
    echo ""
  done
}

run_lineups_backfill() {
  step "Lineup backfill (league=${LINEUP_LEAGUE}, limit=${LINEUP_LIMIT})"
  npx tsx scripts/backfill-event-lineups.ts "${LINEUP_LEAGUE}" "${LINEUP_LIMIT}"
}

echo "Match Predictor — full data refresh"
echo "Project root: ${ROOT}"

if [[ "${SKIP_INSTALL:-}" != "1" ]]; then
  ensure_python_deps
else
  echo "Skipping pip install (SKIP_INSTALL=1)"
fi

ensure_dev_server

if [[ "${SKIP_SYNC:-}" != "1" ]]; then
  run_cron_sync
else
  echo "Skipping RapidAPI sync (SKIP_SYNC=1)"
fi

if [[ "${SKIP_SEED:-}" != "1" ]]; then
  run_seed_sofascore
else
  echo "Skipping SofaScore seed (SKIP_SEED=1)"
fi

if [[ "${SKIP_STATS:-}" != "1" ]]; then
  run_stats_backfill
else
  echo "Skipping stats backfill (SKIP_STATS=1)"
fi

if [[ "${SKIP_SOCCERDATA:-}" != "1" ]]; then
  run_soccerdata_backfill
else
  echo "Skipping SoccerData backfill (SKIP_SOCCERDATA=1)"
fi

if [[ "${SKIP_LINEUPS:-}" != "1" ]]; then
  run_lineups_backfill
else
  echo "Skipping lineup backfill (SKIP_LINEUPS=1)"
fi

step "Done"
echo "Logs: /tmp/cron-sync.json, /tmp/soccerdata-backfill-*.json"
echo "Re-run anytime with: npm run data:refresh"
