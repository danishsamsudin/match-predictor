# Match Predictor

AI-powered sports match prediction engine built with Next.js 16, Supabase, [SofaScore](https://rapidapi.com/apidojo/api/sofascore) (primary football API), [SportAPI7](https://rapidapi.com/rapidsportapi/api/sportapi7) (secondary fallback), and [Weather API](https://rapidapi.com/maruf111/api/weather-api167) (RapidAPI).

## Features

- Win/draw/loss probabilities via Poisson xG model
- Expected goals adjusted for form, H2H, lineups, weather, travel, and altitude
- Estimated corners, fouls, yellow/red cards
- Supabase-backed API response caching with daily rate limits
- Prediction history stored in Postgres

## Quick Start

```bash
cd match-predictor
npm install
cp .env.example .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL (no `/rest/v1/` suffix) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key (client reads) |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server cache writes + prediction inserts) |
| `RAPIDAPI_KEY` | Your RapidAPI key (used for **all** providers below) |
| `FOOTBALL_API_KEY` | Optional alias for `RAPIDAPI_KEY` |
| `FOOTBALL_PRIMARY_PROVIDER` | Primary host, e.g. `sofascore.p.rapidapi.com` |
| `FOOTBALL_SECONDARY_PROVIDER` | Fallback when primary hits quota, e.g. `sportapi7.p.rapidapi.com` |
| `WEATHER_PROVIDER` | `X-RapidAPI-Host` for weather, e.g. `weather-api167.p.rapidapi.com` |
| `DATA_SOURCE` | Set `supabase` so user requests read the DB only (no live football API) |
| `FOOTBALL_DAILY_API_LIMIT` | Max football RapidAPI calls per day during sync (default `50`) |
| `WEATHER_DAILY_API_LIMIT` | Max weather RapidAPI calls per day (default `20`) |
| `SYNC_LEAGUE_IDS` | Comma-separated league IDs, or `all` for full catalog with tiered rotation |
| `SYNC_CRON_SECRET` | Bearer token for `POST /api/cron/sync` |
| `SYNC_CRON_HOUR_UTC` | Earliest UTC hour for the daily sync (default `6`) |
| `USE_MOCK_APIS` | Set `true` to use mock data (no external API calls) |
| `SOCCERDATA_ENABLED` | Set `false` to disable the [SoccerData](https://soccerdata.readthedocs.io/) bridge (default: enabled) |
| `SOCCERDATA_PYTHON` | Python binary with `soccerdata` installed (default `python3`) |
| `SOCCERDATA_DIR` | Cache directory (default `~/soccerdata`) |
| `SOCCERDATA_TIMEOUT_MS` | Max wait per scrape (default `120000`) |

### RapidAPI setup (one key, different hosts)

Every external API uses the same `X-RapidAPI-Key`. Only `X-RapidAPI-Host` changes per subscription:

| Service | Host (`X-RapidAPI-Host`) | Role |
|---------|--------------------------|------|
| SofaScore | `sofascore.p.rapidapi.com` | Primary (`FOOTBALL_PRIMARY_PROVIDER`) |
| SportAPI7 | `sportapi7.p.rapidapi.com` | Secondary fallback (`FOOTBALL_SECONDARY_PROVIDER`) |
| Weather API | `weather-api167.p.rapidapi.com` | `WEATHER_PROVIDER` |

1. Subscribe to [SofaScore](https://rapidapi.com/apidojo/api/sofascore), [SportAPI7](https://rapidapi.com/rapidsportapi/api/sportapi7), and [Weather API](https://rapidapi.com/maruf111/api/weather-api167) on RapidAPI.
2. Set `RAPIDAPI_KEY` once in `.env.local`.
3. Set `DATA_SOURCE=supabase`, `USE_MOCK_APIS=false`, and run migrations (below).
4. Verify: `curl http://localhost:3000/api/football/status`

## Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run migrations in order via the SQL editor or Supabase CLI:
   - **Fresh project (easiest):** paste [`supabase/apply_all_migrations.sql`](supabase/apply_all_migrations.sql) into the Supabase SQL Editor and run it once.
   - **Or one file at a time:**
   - `supabase/migrations/001_prediction_engine.sql`
   - `supabase/migrations/002_football_data_store.sql`
   - `supabase/migrations/003_sofascore_data_catalog.sql`
   - `supabase/migrations/004_entity_type_and_sync_rotation.sql`
   - `supabase/migrations/005_team_prediction_metrics.sql`
   - `supabase/migrations/004_entity_type_and_sync_rotation.sql`

   Migration 004 requires 001–003 first (it alters `predictions` and `synced_teams` created in 001/002).
3. Copy your project URL, anon key, and service role key into `.env.local`

## Scheduled data sync

Football data is pulled by **`POST /api/cron/sync`** (not on every page load). The sync:

- Calls **SofaScore first**; switches to **SportAPI7** only when the primary returns a rate-limit/quota error.
- Stays within **`FOOTBALL_DAILY_API_LIMIT`** (default 50 calls/day), tracked in `football_api_daily`.
- When `SYNC_LEAGUE_IDS=all`, uses **tiered rotation**: Tier 1 leagues daily, Tier 2 every 2–3 days, Tier 3 weekly.
- Syncs **upcoming fixtures** (for the fixture picker) and **past matches** (for form/H2H bundles).
- Writes per-team stats to `synced_team_statistics` for cross-league comparisons.
- Runs once per calendar day after **`SYNC_CRON_HOUR_UTC`** (default 06:00 UTC).

**Initial sync (local):**

```bash
curl -X POST "http://localhost:3000/api/cron/sync?force=true" \
  -H "Authorization: Bearer YOUR_SYNC_CRON_SECRET"
```

On Vercel, `vercel.json` triggers `/api/cron/sync?run=true` daily at 06:00 UTC. Set `CRON_SECRET` or `SYNC_CRON_SECRET` in the project env for auth.

## API rate limits

| Context | Limit |
|---------|--------|
| Football sync (RapidAPI) | `FOOTBALL_DAILY_API_LIMIT` per day (default 50) |
| Weather (RapidAPI) | `WEATHER_DAILY_API_LIMIT` per day (default 20); responses cached 24h |
| User-facing predictions | No football API calls when `DATA_SOURCE=supabase` |

Set `USE_MOCK_APIS=true` for unlimited local development without RapidAPI.

## SoccerData (FBref, Understat, ClubElo, …)

The app integrates the open-source [SoccerData](https://soccerdata.readthedocs.io/en/latest/intro.html) Python library for scraping **ClubElo, ESPN, FBref, Football-Data.co.uk, Sofascore, SoFIFA, Understat, and WhoScored**. This is separate from the RapidAPI SofaScore/SportAPI7 stack used for live predictions.

**Setup (once per machine):**

```bash
cd match-predictor
python3 -m pip install -r services/soccerdata/requirements.txt
curl http://localhost:3000/api/soccerdata/status
```

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/soccerdata/sources` | Catalog of sources and `read_*` methods |
| GET | `/api/soccerdata/status` | Health check (runs `FBref.available_leagues`) |
| POST | `/api/soccerdata/fetch` | Run a scrape; results cached in `synced_api_payloads` |
| POST | `/api/soccerdata/import/fixtures` | Backfill fixtures from FBref schedule into `synced_fixtures` (best-effort mapping) |
| POST | `/api/soccerdata/import/players` | Import SoFIFA player catalog into `soccerdata_players` (SoFIFA overall used as lineup rating fallback) |
| POST | `/api/soccerdata/import/enrich` | Link + import Understat xG or MatchHistory odds into `soccerdata_event_enrichments` |
| POST | `/api/soccerdata/import/backfill` | One-shot: fixtures + xG + odds + SoFIFA players for a league |

**Copy-paste terminal commands:** see [`docs/SOCCERDATA_POPULATE_COMMANDS.md`](docs/SOCCERDATA_POPULATE_COMMANDS.md) (or run `bash scripts/soccerdata-populate.sh` after setting env vars).

**Example — FBref team shooting stats:**

```bash
curl -X POST http://localhost:3000/api/soccerdata/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "source": "FBref",
    "method": "read_team_season_stats",
    "constructor": {
      "leagues": ["ENG-Premier League"],
      "seasons": ["2324"]
    },
    "params": { "stat_type": "shooting" }
  }'
```

**Example — Understat shot events:**

```bash
curl -X POST http://localhost:3000/api/soccerdata/fetch \
  -H "Content-Type: application/json" \
  -d '{
    "source": "Understat",
    "method": "read_shot_events",
    "constructor": {
      "leagues": ["ENG-Premier League"],
      "seasons": ["2023"]
    }
  }'
```

WhoScored and SoFIFA may require **Chrome** and Selenium (see SoccerData docs). On Vercel/serverless, run the Python runner on a VM, cron host, or local machine — not in ephemeral serverless functions.

### SoccerData → canonical enrichment workflow

This repo keeps **SofaScore/SportAPI IDs canonical**. SoccerData is used to enrich/backfill by linking rows to canonical `synced_events.event_id`.

1. Run your normal RapidAPI sync so `synced_events` contains canonical event IDs.
2. Pull SoccerData datasets (cached via `/api/soccerdata/fetch`).
3. Run importer endpoints to link/import into canonical ids.
**FBref fixtures backfill:**

```bash
curl -X POST http://localhost:3000/api/soccerdata/import/fixtures \
  -H "Content-Type: application/json" \
  -d '{"leagueId":39,"seasons":[2025]}'
```

**Understat xG link + import:**

```bash
curl -X POST http://localhost:3000/api/soccerdata/import/enrich \
  -H "Content-Type: application/json" \
  -d '{"kind":"understat_xg","leagueId":39,"seasons":[2025]}'
```

**Football-Data.co.uk odds link + import:**

```bash
curl -X POST http://localhost:3000/api/soccerdata/import/enrich \
  -H "Content-Type: application/json" \
  -d '{"kind":"matchhistory_odds","leagueId":39,"seasons":[2025]}'
```

**SoFIFA player baseline ratings (fallback for lineup ratings):**

```bash
curl -X POST http://localhost:3000/api/soccerdata/import/players \
  -H "Content-Type: application/json" \
  -d '{"leagueId":39,"version":"latest"}'
```

## Prediction API

**POST** `/api/predict`

Fixture mode (scheduled match):

```json
{
  "mode": "fixture",
  "matchId": 1035037,
  "homeTeamId": 33,
  "awayTeamId": 40,
  "homeLeagueId": 39,
  "awayLeagueId": 39,
  "entityType": "club",
  "city": "Manchester",
  "matchDate": "2026-05-29T15:00:00.000Z"
}
```

Compare mode (cross-league club or national team):

```json
{
  "mode": "compare",
  "homeTeamId": 5981,
  "awayTeamId": 194,
  "homeLeagueId": 71,
  "awayLeagueId": 88,
  "entityType": "club",
  "city": "Amsterdam",
  "matchDate": "2026-05-29T15:00:00.000Z"
}
```

National team example (Brazil vs Netherlands):

```json
{
  "mode": "compare",
  "homeTeamId": 4748,
  "awayTeamId": 4710,
  "homeLeagueId": 1,
  "awayLeagueId": 1,
  "entityType": "national",
  "city": "London",
  "matchDate": "2026-06-15T15:00:00.000Z"
}
```

Response includes `homeWinPct`, `awayWinPct`, `drawPct`, `expectedGoals`, `estimated`, and `explanation`.

### Supported competitions

**Clubs:** Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Eredivisie, Primeira Liga, Championship, Segunda, 2. Bundesliga, Serie B, Ligue 2, Belgium, Scotland, Turkey, MLS, Brasileirão, Argentina, Saudi Pro League, Greece, Austria, Switzerland, Denmark, Norway, Sweden, Liga MX, J1, K League, UCL, UEL, Conference League.

**National teams:** FIFA World Cup, UEFA Euro, UEFA Nations League, Copa América.

## Project Structure

```
src/
├── app/
│   ├── api/predict/route.ts    # Prediction endpoint
│   ├── page.tsx                # Prediction form
│   └── predictions/            # History pages
├── components/                 # UI components
└── lib/
    ├── supabase.ts             # Supabase clients
    ├── api/                    # Football + Weather clients
    ├── cache/                  # Rate-limited caching
    └── prediction/             # Algorithm modules
```

## Scripts

- `npm run dev` — Start development server
- `npm run build` — Production build
- `npm run lint` — ESLint

## GitHub CI

Pull requests run lint and build via `.github/workflows/ci.yml`.
