#!/usr/bin/env bash
# Live API smoke test — run from match-predictor/ with .env.local configured.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env.local ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env.local
  set +a
fi

KEY="${RAPIDAPI_KEY:-${FOOTBALL_API_KEY:-}}"
if [[ "${FOOTBALL_PROVIDER:-}" == *rapidapi.com* ]]; then
  FOOTBALL_HOST="${FOOTBALL_PROVIDER}"
else
  FOOTBALL_HOST="${SPORTAPI_RAPIDAPI_HOST:-sportapi7.p.rapidapi.com}"
fi
OPEN_METEO_FORECAST="${OPEN_METEO_FORECAST_URL:-https://api.open-meteo.com}"
OPEN_METEO_GEO="${OPEN_METEO_GEOCODING_URL:-https://geocoding-api.open-meteo.com}"
APP_URL="${APP_URL:-http://localhost:3000}"
TODAY="$(date +%Y-%m-%d)"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  DynamixG — live API smoke test"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "USE_MOCK_APIS=${USE_MOCK_APIS:-<unset>}"
echo "APP_URL=$APP_URL"
echo ""

if [[ -z "$KEY" ]]; then
  echo "❌ No RapidAPI key. Set RAPIDAPI_KEY in .env.local (required for football APIs)"
  exit 1
fi

if [[ "${USE_MOCK_APIS:-false}" == "true" ]]; then
  echo "⚠️  USE_MOCK_APIS=true — the Next.js app will NOT call live APIs."
  echo "   Set USE_MOCK_APIS=false and restart: npm run dev"
  echo ""
fi

echo "1) Direct RapidAPI — SportAPI7 (categories today)"
SPORT_CODE=$(curl -s -o /tmp/sportapi-test.json -w "%{http_code}" \
  "https://${FOOTBALL_HOST}/api/v1/sport/football/${TODAY}/0/categories" \
  -H "X-RapidAPI-Key: ${KEY}" \
  -H "X-RapidAPI-Host: ${FOOTBALL_HOST}")
if [[ "$SPORT_CODE" == "200" ]]; then
  COUNT=$(python3 -c "import json; d=json.load(open('/tmp/sportapi-test.json')); print(len(d.get('categories',[])))" 2>/dev/null || echo "?")
  echo "   ✅ HTTP 200 — $COUNT football categories with matches today"
else
  MSG=$(python3 -c "import json; print(json.load(open('/tmp/sportapi-test.json')).get('message',''))" 2>/dev/null || cat /tmp/sportapi-test.json)
  echo "   ❌ HTTP $SPORT_CODE — $MSG"
  echo "   → Subscribe: https://rapidapi.com/rapidsportapi/api/sportapi7"
fi
echo ""

echo "2) Open-Meteo — Geocoding (Manchester)"
GEO_CODE=$(curl -s -o /tmp/open-meteo-geo.json -w "%{http_code}" \
  "${OPEN_METEO_GEO}/v1/search?name=Manchester&count=1&language=en&format=json")
if [[ "$GEO_CODE" == "200" ]]; then
  LAT=$(python3 -c "import json; r=json.load(open('/tmp/open-meteo-geo.json')).get('results',[{}])[0]; print(r.get('latitude','?'))" 2>/dev/null || echo "?")
  LON=$(python3 -c "import json; r=json.load(open('/tmp/open-meteo-geo.json')).get('results',[{}])[0]; print(r.get('longitude','?'))" 2>/dev/null || echo "?")
  echo "   ✅ HTTP 200 — Manchester at ${LAT}, ${LON}"
else
  MSG=$(python3 -c "import json; d=json.load(open('/tmp/open-meteo-geo.json')); print(d.get('reason', d))" 2>/dev/null || cat /tmp/open-meteo-geo.json)
  echo "   ❌ HTTP $GEO_CODE — $MSG"
  echo "   → Docs: https://open-meteo.com/en/docs/geocoding-api"
fi
echo ""

echo "3) Open-Meteo — Forecast (Manchester hourly)"
FORECAST_CODE=$(curl -s -o /tmp/open-meteo-forecast.json -w "%{http_code}" \
  "${OPEN_METEO_FORECAST}/v1/forecast?latitude=53.48&longitude=-2.24&hourly=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m&forecast_days=3&timezone=UTC&wind_speed_unit=kmh")
if [[ "$FORECAST_CODE" == "200" ]]; then
  N=$(python3 -c "import json; d=json.load(open('/tmp/open-meteo-forecast.json')); print(len(d.get('hourly',{}).get('time',[])))" 2>/dev/null || echo "?")
  echo "   ✅ HTTP 200 — $N hourly forecast entries"
else
  MSG=$(python3 -c "import json; d=json.load(open('/tmp/open-meteo-forecast.json')); print(d.get('reason', d))" 2>/dev/null || cat /tmp/open-meteo-forecast.json)
  echo "   ❌ HTTP $FORECAST_CODE — $MSG"
  echo "   → Docs: https://open-meteo.com/en/docs"
fi
echo ""

if curl -s -o /dev/null -w "" --connect-timeout 2 "$APP_URL" 2>/dev/null; then
  echo "4) App route — GET /api/football/status"
  curl -s "$APP_URL/api/football/status" | python3 -m json.tool
  echo ""

  echo "5) App route — GET /api/football/fixtures?league=39 (Premier League)"
  curl -s "$APP_URL/api/football/fixtures?league=39" | python3 -c "
import json,sys
d=json.load(sys.stdin)
if 'error' in d: print('   ❌', d['error'])
else:
  fs=d.get('fixtures',[])
  print(f'   ✅ {len(fs)} fixtures')
  for f in fs[:3]:
    print(f\"      • {f['home']['name']} vs {f['away']['name']} (id {f['id']})\")
"
  echo ""
  echo "Tip: pick a real matchId/homeTeamId/awayTeamId from step 5, then POST /api/predict"
else
  echo "4) App not reachable at $APP_URL — start it: npm run dev"
fi

echo ""
echo "Done."
