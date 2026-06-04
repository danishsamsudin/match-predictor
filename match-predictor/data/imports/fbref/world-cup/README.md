# FBref World Cup 2026 imports

Saved HTML from FBref (Chrome → **Save As → Web Page, Complete**).

## Layout

| File pattern | Contents |
|--------------|----------|
| `World Cup Scores & Fixtures _ FBref.com.htm` | Tournament schedule (72 fixtures) |
| `{Country} Men Stats, ... _ FBref.com.html` | Squad roster, manager, match logs, player stat tables |

Optional later: `matches/<match_id>.html` for post-match lineups (not on squad pages).

## Import everything to Supabase

1. Apply migrations `010_fbref_world_cup_store.sql` and `012_fbref_extended_stats.sql` in the Supabase SQL editor (if not already applied).

2. From `match-predictor/`:

```bash
source .env.local   # or rely on import script sourcing via shell wrapper
./scripts/import-fbref-world-cup.sh
```

Dry run (parse only):

```bash
python scripts/import_fbref_world_cup_local.py --dry-run
```

## What gets loaded

| Table | Source |
|-------|--------|
| `teams` | Squad pages + opponents from match logs + schedule |
| `players` | Standard / keeper / shooting / playing time / misc tables |
| `managers` | “Manager: …” on each squad page |
| `matches` | Match logs per country + World Cup schedule |
| `player_season_stats` | All `stats_*` tables as JSON per player (needs migration 012) |
| `lineups` | Only from saved **match report** HTML (not squad pages) |

## WC 2026 coverage

All **48** qualified nations should have a `{Country} Men Stats...html` file (including **Sweden**).

Filename aliases handled automatically: United States → USA, Cape Verde → Cabo Verde, Korea Republic → South Korea, IR Iran → Iran, Congo DR → DR Congo, etc.

## Group codes & predictions

The World Cup hub sync (`POST /api/cron/world-cup`) infers `group_code` on **FIFA World Cup 2026** fixtures (or matches dated 11 Jun–19 Jul 2026) when both teams belong to the same group in `data/world-cup-2026-groups.json`. Manual `group_code` values in Supabase take precedence.

## Stadiums & host cities

All **72** group-stage venues come from the saved schedule. Canonical stadium → city mapping lives in `data/world-cup-2026/fixture-venues.json` (16 host stadiums across USA, Mexico, and Canada). The hub enriches each fixture with `venue` (stadium), `venue_city` (predictor / weather), and altitude.

Backfill Supabase after import:

```bash
# from the app root (the folder that contains package.json)
npm run wc:venues
# preview: npx tsx scripts/seed-world-cup-fixture-venues.ts --dry-run
```

If you see `Updated 0/0`, Supabase has no tournament fixtures yet — run `./scripts/import-fbref-world-cup.sh` first. The seed script matches all **72** rows from `fixture-venues.json` by date + teams (competition label `FIFA World Cup 2026` or `World Cup`).

**Open in predictor** links pass `city=` from `venue_city` (e.g. Guadalajara, Los Angeles).

## View on localhost

Imported FBref data lives in `teams`, `players`, `matches`, `player_season_stats`, etc. The main predictor UI still uses SofaScore `synced_*` tables for squads and lineups.

1. `.env.local`: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
2. Apply migration `013_fbref_public_read.sql`
3. `npm run dev` → [http://localhost:3000/dev/fbref](http://localhost:3000/dev/fbref)

API: `/api/fbref/teams`, `/api/fbref/teams/{id}/players`, `/api/fbref/matches`
