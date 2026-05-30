# Match Predictor

AI-powered sports match prediction engine built with Next.js 16, Supabase, [SportAPI7](https://rapidapi.com/rapidsportapi/api/sportapi7) (RapidAPI), and [Weather API](https://rapidapi.com/maruf111/api/weather-api167) (RapidAPI).

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
| `FOOTBALL_PROVIDER` | `sportapi7` (default) or `api-football` for legacy API-Sports |
| `WEATHER_PROVIDER` | `X-RapidAPI-Host` for weather, e.g. `weather-api167.p.rapidapi.com` |
| `USE_MOCK_APIS` | Set `true` to use mock data (no external API calls) |

### RapidAPI setup (one key, different hosts)

Every external API uses the same `X-RapidAPI-Key`. Only `X-RapidAPI-Host` changes per subscription:

| Service | Host (`X-RapidAPI-Host`) | Env |
|---------|--------------------------|-----|
| SportAPI7 | `sportapi7.p.rapidapi.com` | `FOOTBALL_PROVIDER=sportapi7` |
| Weather API | `weather-api167.p.rapidapi.com` | `WEATHER_PROVIDER=weather-api167.p.rapidapi.com` |
| API-Football (legacy) | `v3.football.api-sports.io` | `FOOTBALL_PROVIDER=api-football` |

1. Create a [RapidAPI](https://rapidapi.com) account and subscribe to [SportAPI7](https://rapidapi.com/rapidsportapi/api/sportapi7) and [Weather API](https://rapidapi.com/maruf111/api/weather-api167).
2. Set `RAPIDAPI_KEY` (or `FOOTBALL_API_KEY`) once in `.env.local`.
3. Set `WEATHER_PROVIDER=weather-api167.p.rapidapi.com`.
4. Set `USE_MOCK_APIS=false` and verify: `curl http://localhost:3000/api/football/status`

## Supabase Setup

1. Create a Supabase project at [supabase.com](https://supabase.com)
2. Run the migration in `supabase/migrations/001_prediction_engine.sql` via the SQL editor or Supabase CLI
3. Copy your project URL, anon key, and service role key into `.env.local`

## API Rate Limits

The app enforces daily caps to stay within free-tier limits:

| Provider | Max live calls/day | Cache TTL |
|----------|-------------------|-----------|
| Weather API (RapidAPI) | 1 | 24 hours |
| SportAPI7 / API-Football | 2 | 12 hours |

Cached responses are served when limits are reached. Set `USE_MOCK_APIS=true` for unlimited local development.

## Prediction API

**POST** `/api/predict`

```json
{
  "matchId": 1035037,
  "homeTeamId": 33,
  "awayTeamId": 40,
  "city": "Manchester",
  "matchDate": "2026-05-29T15:00:00.000Z"
}
```

Response includes `homeWinPct`, `awayWinPct`, `drawPct`, `expectedGoals`, `estimated`, and `explanation`.

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
