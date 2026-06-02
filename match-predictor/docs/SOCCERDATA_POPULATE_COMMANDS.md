# SoccerData populate commands (copy & paste)

This guide is for **anyone new to the project**. It explains what each command does, which database tables it fills, and how the pieces fit together.

---

## How this app gets football data (big picture)

The Match Predictor uses **two complementary data paths**:

| Path | Technology | What it provides | When you run it |
|------|------------|------------------|-----------------|
| **Primary (canonical)** | RapidAPI → SofaScore / SportAPI7 | Real match IDs, teams, standings, lineups, H2H, player ratings from live APIs | `POST /api/cron/sync` |
| **Secondary (enrichment)** | Python **SoccerData** library (FBref, Understat, etc.) | Extra stats: schedules, xG, betting odds, FIFA-style player ratings | `POST /api/soccerdata/import/*` |

**Important:** The app’s “source of truth” for teams and matches is **SofaScore/SportAPI numeric IDs** (`team_id`, `event_id`). SoccerData does not replace those IDs—it **adds** data and can **backfill** when the primary sync did not get fixtures (e.g. API quota exhausted).

```
You (terminal curl)
       │
       ▼
Next.js API routes  ──►  Supabase Postgres
       │                    ├── synced_teams, synced_fixtures, synced_events  (from RapidAPI)
       │                    ├── synced_match_bundles, synced_player_ratings     (from RapidAPI)
       │                    └── soccerdata_* tables                           (from SoccerData)
       │
       └──► Python runner (services/soccerdata/runner.py)  ──►  scrapes FBref, Understat, etc.
```

**Before running any command below:** keep the dev server running in another terminal:

```bash
cd match-predictor
npm run dev
```

---

## Placeholders to replace

| Placeholder | What it is | Example |
|-------------|------------|---------|
| `BASE_URL` | Where your local Next.js app listens | `http://localhost:3000` |
| `SYNC_CRON_SECRET` | Password for sync endpoint; must match `.env.local` | copy from `SYNC_CRON_SECRET=...` |
| `LEAGUE_ID` | Internal competition ID used in the app (not SofaScore’s ID) | `39` = Premier League |
| `SEASON` | Season **start year** for our reference data | `2025` for 2025/26; use `2026` for World Cup (`LEAGUE_ID=1`) |

---

## Glossary: main database tables

| Table | Filled by | Used for |
|-------|-----------|----------|
| `synced_teams` | RapidAPI sync | Team picker; maps team names to `team_id` |
| `synced_fixtures` | RapidAPI sync and/or SoccerData FBref backfill | Upcoming matches in the fixture picker |
| `synced_events` | RapidAPI sync | Canonical match records (`event_id`) |
| `synced_match_bundles` | RapidAPI sync | Pre-built stats for predictions (lineups, H2H, etc.) |
| `synced_player_ratings` | RapidAPI sync | Rolling SofaScore “best player” ratings |
| `soccerdata_team_aliases` | SoccerData import | Links FBref/Understat team **names** → our `team_id` |
| `soccerdata_match_links` | SoccerData import | Links external match rows → our `event_id` |
| `soccerdata_event_enrichments` | SoccerData import | xG and betting odds per `event_id` |
| `soccerdata_players` | SoccerData import | SoFIFA player catalog (fallback lineup ratings) |
| `synced_api_payloads` | SoccerData `/fetch` | Raw JSON cache (audit / advanced use) |

---

## 0) One-time setup

**Goal:** Install dependencies, database schema, and environment so API routes can talk to Supabase and Python.

### Install Node and Python packages

```bash
cd match-predictor
npm install
npm run soccerdata:install
```

- `npm install` — JavaScript dependencies for the Next.js app.
- `npm run soccerdata:install` — Installs the Python `soccerdata` package (see `services/soccerdata/requirements.txt`). Required for any `/api/soccerdata/*` route.

### Database migrations

In the Supabase SQL editor, run migrations **006** and **007**, or run the combined file once:

- `supabase/migrations/006_soccerdata_mapping.sql` — mapping + enrichment tables  
- `supabase/migrations/007_soccerdata_player_fields.sql` — extra player columns  

Or paste all of `supabase/apply_all_migrations.sql` on a fresh project.

### Environment file (`.env.local`)

| Variable | Why you need it |
|----------|-----------------|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Client-side reads |
| `SUPABASE_SERVICE_ROLE_KEY` | Server writes during sync/import (required) |
| `DATA_SOURCE=supabase` | App reads from DB instead of calling RapidAPI on every page load |
| `RAPIDAPI_KEY` | One key for SofaScore + SportAPI7 + weather |
| `FOOTBALL_PRIMARY_PROVIDER` / `FOOTBALL_SECONDARY_PROVIDER` | RapidAPI hostnames (see README) |
| `SYNC_CRON_SECRET` | Protects `/api/cron/sync` from random callers |

### Start the dev server

```bash
npm run dev
```

The server must stay running while you `curl` the API routes below.

### Health check: is Python SoccerData working?

```bash
curl http://localhost:3000/api/soccerdata/status
```

**What this does:** Runs a small Python scrape (`FBref.available_leagues`) through the bridge.  

**Success looks like:** `"ok": true` and a list of sample leagues.  

**Failure looks like:** `"ok": false` with a message about Python or `pip install` — fix before continuing.

---

## 1) Populate canonical SofaScore data (teams, events, ratings)

**Goal:** Fill the **primary** tables from RapidAPI (SofaScore first, SportAPI7 as fallback). This is what the match predictor and pickers rely on first.

**What gets written:**

- `synced_teams` — every team in the league table from standings  
- `synced_events` — recent and upcoming matches  
- `synced_fixtures` — upcoming games for the fixture picker (if API budget remains)  
- `synced_match_bundles` — stats + lineups for a few matches per league (if budget remains)  
- `synced_player_ratings` — player form from recent “best player” endpoints  

**Requires:** `DATA_SOURCE=supabase` and a valid `RAPIDAPI_KEY`. Uses your **daily football API budget** (`FOOTBALL_DAILY_API_LIMIT`, default 50).

```bash
export BASE_URL="http://localhost:3000"
export SYNC_CRON_SECRET="YOUR_SYNC_CRON_SECRET"

curl -X POST "${BASE_URL}/api/cron/sync?force=true" \
  -H "Authorization: Bearer ${SYNC_CRON_SECRET}"
```

**Flags explained:**

- `force=true` — Run even if a sync already ran today.  
- `Authorization: Bearer ...` — Must match `SYNC_CRON_SECRET` in `.env.local`.

**How to read the JSON response:**

| Field | Meaning |
|-------|---------|
| `leaguesSynced` | How many competitions were processed this run |
| `fixturesSynced` | How many upcoming fixtures saved (0 is common if quota ran out) |
| `bundlesSynced` | How many full match bundles built for predictions |
| `footballApiCalls` | RapidAPI calls used (stops near daily limit) |

If `fixturesSynced` is **0**, continue to **section 2** — SoccerData can still backfill schedules from FBref.

---

## 2) One-shot SoccerData backfill for a league (recommended)

**Goal:** After step 1, enrich **one competition** with SoccerData in the correct order—without running four separate curls yourself.

**Order of operations inside the API:**

1. **FBref schedule** → `synced_fixtures` + team name aliases  
2. **Understat xG** → `soccerdata_event_enrichments` (only if `synced_events` exist from step 1)  
3. **MatchHistory odds** → same enrichment table  
4. **SoFIFA players** → `soccerdata_players` (helps lineup rating fallback in predictions)  

**Pick `LEAGUE_ID` from the table in [All platform league IDs](#all-platform-league-ids-league_id) below.**

```bash
export BASE_URL="http://localhost:3000"
export LEAGUE_ID=39
export SEASON=2025

curl -X POST "${BASE_URL}/api/soccerdata/import/backfill" \
  -H "Content-Type: application/json" \
  -d "{\"leagueId\":${LEAGUE_ID},\"season\":${SEASON}}"
```

**Body fields:**

- `leagueId` — Reference league ID (e.g. `39` = Premier League).  
- `season` — Start year of the season (e.g. `2025` for 2025/26).  

**Success:** JSON with `"ok": true`, `steps` (per-step counts), and `warnings` (non-fatal issues). A step that fails (e.g. Football-Data.co.uk odds) is listed in `warnings` — the rest still run.  

**This can take several minutes** — Python is scraping external websites.

If odds repeatedly fail (`football-data.co.uk ... E0.csv`), skip them:

```bash
curl -X POST "${BASE_URL}/api/soccerdata/import/backfill" \
  -H "Content-Type: application/json" \
  -d '{"leagueId":39,"season":2025,"steps":{"matchHistoryOdds":false}}'
```

### Optional: run only some steps

Use this if you only need fixtures, or want to avoid slow SoFIFA scraping:

```bash
curl -X POST "${BASE_URL}/api/soccerdata/import/backfill" \
  -H "Content-Type: application/json" \
  -d '{
    "leagueId": 39,
    "season": 2025,
    "steps": {
      "fixtures": true,
      "understatXg": true,
      "matchHistoryOdds": true,
      "players": false
    }
  }'
```

---

## 3) Individual import commands (step-by-step)

Use these when you want **control** over each step, or when debugging one data source.

### 3a) FBref fixtures → `synced_fixtures`

**Goal:** Download the season schedule from FBref and insert upcoming matches into `synced_fixtures` when RapidAPI did not.

**How matching works:** Team names from FBref are normalized and matched to rows already in `synced_teams` (from step 1). Unmatched teams are skipped.

**Note:** If SofaScore never assigned a real `event_id`, the importer may create a **negative synthetic** `event_id` so the fixture picker has something to show. Predictions work best with real IDs from step 1.

```bash
export BASE_URL="http://localhost:3000"
export LEAGUE_ID=39

curl -X POST "${BASE_URL}/api/soccerdata/import/fixtures" \
  -H "Content-Type: application/json" \
  -d "{\"leagueId\":${LEAGUE_ID},\"seasons\":[2025,\"2526\"]}"
```

- `seasons` — FBref often uses `"2526"` for 2025/26; passing both `2025` and `"2526"` improves compatibility.

**Response:** `fixturesUpserted`, `aliasesUpserted`.

---

### 3b) Understat xG → `soccerdata_event_enrichments`

**Goal:** Attach expected goals (xG) to matches that already exist in `synced_events`.

**Prerequisite:** Step 1 must have populated `synced_events` for this league. The importer matches on **date + home team + away team** (within ~36 hours).

```bash
curl -X POST "${BASE_URL}/api/soccerdata/import/enrich" \
  -H "Content-Type: application/json" \
  -d '{"kind":"understat_xg","leagueId":39,"seasons":[2025]}'
```

- `kind` — Must be exactly `"understat_xg"`.  
- `seasons` — Understat typically uses the starting calendar year (`2025`).

**Response:** `{ "linked": N }` — number of matches linked and enriched.

---

### 3c) Football-Data.co.uk odds → `soccerdata_event_enrichments`

**Goal:** Add historical betting odds (home/draw/away) to the same enrichment table, linked to canonical `event_id`.

**Prerequisite:** Same as 3b — needs `synced_events` from RapidAPI sync.

```bash
curl -X POST "${BASE_URL}/api/soccerdata/import/enrich" \
  -H "Content-Type: application/json" \
  -d '{"kind":"matchhistory_odds","leagueId":39,"seasons":["2526"]}'
```

- `kind` — Must be `"matchhistory_odds"`.  
- `seasons` — MatchHistory often uses two-digit season codes like `"2526"`.

**Response:** `{ "linked": N }`.

---

### 3d) SoFIFA players → `soccerdata_players`

**Goal:** Build a local catalog of players and FIFA-style overall ratings. When SofaScore does not have a player rating, the prediction engine can **fall back** to these values for lineup impact.

**Warning:** SoFIFA scraping can be slow and may need Chrome/Selenium on some machines.

```bash
curl -X POST "${BASE_URL}/api/soccerdata/import/players" \
  -H "Content-Type: application/json" \
  -d '{"leagueId":39,"version":"latest"}'
```

- `version` — `"latest"` for current FIFA ratings release, or a specific SoFIFA version ID.

**Response:** `{ "playersUpserted": N }`.

---

## 4) Raw SoccerData scrape (optional audit cache)

**Goal:** Call the generic SoccerData bridge and store the **raw JSON** in `synced_api_payloads`. Use this for experimentation, custom analytics, or data you have not wired into structured tables yet.

This does **not** automatically update pickers or predictions unless you also run the import routes in section 3.

### FBref team shooting stats (season aggregates)

**What you get:** Per-team shooting tables (shots, xG, etc.) for a league/season.

```bash
curl -X POST "${BASE_URL}/api/soccerdata/fetch" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "FBref",
    "method": "read_team_season_stats",
    "constructor": {
      "leagues": ["ENG-Premier League"],
      "seasons": ["2526"]
    },
    "params": { "stat_type": "shooting" }
  }'
```

- `source` — Data provider class name in SoccerData.  
- `method` — Python method to call on that class.  
- `constructor.leagues` — SoccerData league string (not our `LEAGUE_ID`).  
- `params` — Extra arguments passed to the method.

### Understat shot-level events

**What you get:** Shot-by-shot data with xG values (large dataset).

```bash
curl -X POST "${BASE_URL}/api/soccerdata/fetch" \
  -H "Content-Type: application/json" \
  -d '{
    "source": "Understat",
    "method": "read_shot_events",
    "constructor": {
      "leagues": ["ENG-Premier League"],
      "seasons": [2025]
    }
  }'
```

### List all supported sources and methods

**What you get:** A catalog of every `source` / `method` the app allows (mirrors SoccerData docs).

```bash
curl "${BASE_URL}/api/soccerdata/sources"
```

Use this when you are unsure which `method` name to pass to `/api/soccerdata/fetch`.

---

## 5) Verify in Supabase (SQL editor)

**Goal:** Confirm data landed in the right tables. Replace `39` with your `LEAGUE_ID`.

```sql
-- Teams (should be > 0 after step 1)
SELECT COUNT(*) AS teams FROM synced_teams WHERE league_id = 39;

-- Upcoming fixtures (step 1 and/or SoccerData step 2/3a)
SELECT COUNT(*) AS fixtures FROM synced_fixtures WHERE league_id = 39;

-- Canonical matches from SofaScore (needed for xG/odds linking)
SELECT COUNT(*) AS events FROM synced_events WHERE reference_league_id = 39;

-- Name mapping for SoccerData ↔ SofaScore teams
SELECT COUNT(*) AS aliases FROM soccerdata_team_aliases WHERE league_id = 39;

-- xG and odds per match
SELECT COUNT(*) AS enrichments FROM soccerdata_event_enrichments WHERE league_id = 39;

-- SoFIFA player rows
SELECT COUNT(*) AS players FROM soccerdata_players WHERE league_id = 39;
```

**Optional — see actual fixtures:**

```sql
SELECT kickoff_at, home_team_name, away_team_name, event_id
FROM synced_fixtures
WHERE league_id = 39
ORDER BY kickoff_at
LIMIT 20;
```

---

## All platform league IDs (`LEAGUE_ID`)

These are the **reference league IDs** used everywhere in the app (pickers, sync, SoccerData imports).  
Source of truth: `src/lib/data/football-reference.ts` and `src/lib/config/sportapi-leagues.ts`.

Use the **`LEAGUE_ID`** column in `curl` bodies (`leagueId`, `reference_league_id` in SQL).

| `LEAGUE_ID` | Competition | Country | Entity | Type | Ref teams‡ | Season | Sync tier | FBref | Understat | Odds |
|-------------|-------------|---------|--------|------|------------|--------|-----------|-------|-----------|------|
| **39** | Premier League | England | club | League | 20 | 2025 | 1 | Yes | Yes | Yes |
| **140** | La Liga | Spain | club | League | 7 | 2025 | 1 | Yes | Yes | Yes |
| **78** | Bundesliga | Germany | club | League | 4 | 2025 | 1 | Yes | Yes | Yes |
| **135** | Serie A | Italy | club | League | 5 | 2025 | 1 | Yes | Yes | Yes |
| **61** | Ligue 1 | France | club | League | 3 | 2025 | 1 | Yes | Yes | Yes |
| **88** | Eredivisie | Netherlands | club | League | 3 | 2025 | 1 | No* | Yes | Yes |
| **2** | UEFA Champions League | World | club | Cup | 10 | 2025 | 1 | No* | No* | No* |
| **3** | UEFA Europa League | World | club | Cup | 4 | 2025 | 1 | No* | No* | No* |
| **40** | Championship | England | club | League | 10 | 2025 | 2 | No* | No* | No* |
| **141** | Segunda División | Spain | club | League | 0† | 2025 | 2 | No* | No* | No* |
| **79** | 2. Bundesliga | Germany | club | League | 0† | 2025 | 2 | No* | No* | No* |
| **136** | Serie B | Italy | club | League | 0† | 2025 | 2 | No* | No* | No* |
| **62** | Ligue 2 | France | club | League | 0† | 2025 | 2 | No* | No* | No* |
| **253** | MLS | USA | club | League | 0† | 2025 | 2 | No* | No* | No* |
| **307** | Saudi Pro League | Saudi Arabia | club | League | 0† | 2025 | 2 | No* | No* | No* |
| **848** | UEFA Conference League | World | club | Cup | 0† | 2025 | 3 | No* | No* | No* |
| **1** | FIFA World Cup | International | national | Cup | 48 | **2026** | 2 | No* | No* | No* |
| **4** | UEFA Euro | International | national | Cup | 6 | 2025 | 2 | No* | No* | No* |
| **5** | UEFA Nations League | International | national | Cup | 6 | 2025 | 2 | No* | No* | No* |
| **6** | Copa América | International | national | Cup | 0† | 2025 | 3 | No* | No* | No* |

\* **No** = not mapped yet in `src/lib/config/soccerdata-leagues.ts` (SoccerData backfill for that source will skip or fail until you add a mapping).  
† **0** = no hardcoded reference team list in the app; teams still populate from **`synced_teams`** after `/api/cron/sync`.  
‡ **Ref teams** = teams in the built-in picker fallback list; full squads come from RapidAPI sync into `synced_teams`.

**Entity:** `club` = domestic leagues; `national` = international teams (World Cup, Euro, etc.).

**Sync tier** (when `SYNC_LEAGUE_IDS=all` in `.env.local`):

- **Tier 1** — synced most often (top leagues + UCL/UEL)  
- **Tier 2** — every 2–3 days  
- **Tier 3** — weekly (e.g. Conference League, Copa América)  

---

## Batch commands (multiple leagues)

### Backfill one league (change ID and season)

```bash
export BASE_URL="http://localhost:3000"
export LEAGUE_ID=140   # La Liga — see table above
export SEASON=2025     # use 2026 for LEAGUE_ID=1 (World Cup)

curl -X POST "${BASE_URL}/api/soccerdata/import/backfill" \
  -H "Content-Type: application/json" \
  -d "{\"leagueId\":${LEAGUE_ID},\"season\":${SEASON}}"
```

### Backfill all Big-5 leagues (full SoccerData support for FBref/xG/odds)

**What this does:** Runs section 2 once per league ID in the loop. Expect **long runtime** (tens of minutes total).

```bash
export BASE_URL="http://localhost:3000"
export SEASON=2025

for LEAGUE_ID in 39 140 78 135 61; do
  echo "=== Backfill league ${LEAGUE_ID} ==="
  curl -sS -X POST "${BASE_URL}/api/soccerdata/import/backfill" \
    -H "Content-Type: application/json" \
    -d "{\"leagueId\":${LEAGUE_ID},\"season\":${SEASON}}"
  echo ""
done
```

### Sync all platform leagues via RapidAPI

**What this does:** Same as section 1, but processes every league in the rotation when `SYNC_LEAGUE_IDS=all`.

**Requires in `.env.local`:**

```bash
SYNC_LEAGUE_IDS=all
```

```bash
export BASE_URL="http://localhost:3000"
export SYNC_CRON_SECRET="YOUR_SYNC_CRON_SECRET"

curl -X POST "${BASE_URL}/api/cron/sync?force=true" \
  -H "Authorization: Bearer ${SYNC_CRON_SECRET}"
```

### Sync only specific leagues (save API quota)

**What this does:** Limits RapidAPI usage to the leagues you list. Restart `npm run dev` after changing `.env.local`.

```bash
# In .env.local (example — Premier League + La Liga + Bundesliga only):
SYNC_LEAGUE_IDS=39,140,78
```

Then run the cron sync command from section 1 again.

---

## Automated script (both steps)

**What this does:** Runs RapidAPI sync, then SoccerData backfill for one league. Edit variables at the top of the file first.

```bash
export SYNC_CRON_SECRET="your-secret-from-env"
export LEAGUE_ID=39
npm run soccerdata:populate
```

Equivalent to: `bash scripts/soccerdata-populate.sh`

---

## Recommended workflow for a new developer

1. Complete **section 0** (setup + `/api/soccerdata/status`).  
2. Run **section 1** once (`/api/cron/sync`) so `synced_teams` and `synced_events` exist.  
3. Pick a `LEAGUE_ID` from the table (start with **39**).  
4. Run **section 2** (`/api/soccerdata/import/backfill`).  
5. Run **section 5** SQL checks in Supabase.  
6. Open the app at `http://localhost:3000` and try the fixture picker for that league.

---

## Troubleshooting

| Symptom | Likely cause | What to do |
|---------|--------------|------------|
| `502` from SoccerData routes | Python not installed or scrape failed | Run `npm run soccerdata:install`; check `/api/soccerdata/status` |
| `linked: 0` for xG/odds | No `synced_events` for that league | Run section 1 first; confirm with SQL |
| `fixturesUpserted: 0` | Team name mismatch or empty schedule | Ensure `synced_teams` has rows; check `soccerdata_team_aliases` |
| `Could not download https://fbref.com/en/comps/` | **FBref blocked your scrape** (403 / Cloudflare), not a bad `curl` | Re-run backfill — fixture import auto-falls back to **Understat** for Big 5; or use VPN / browser cookies per [soccerdata#916](https://github.com/probberechts/soccerdata/issues/916) |
| `Could not download ... football-data.co.uk ... E0.csv` | **Odds CSV step failed** (503 / bot block / season not live) | Backfill now returns `"ok": true` with partial `steps` and a **warning** instead of failing entirely. Skip odds: `"matchHistoryOdds": false` in `steps` |
| Backfill returns `"ok": false` for one step | Older behavior — restart `npm run dev` after pulling latest | You should get `"ok": true`, `steps`, and `warnings` even when odds/SoFIFA fail |
| Cron returns `fixturesSynced: 0` | API daily limit reached | Wait for reset or raise `FOOTBALL_DAILY_API_LIMIT`; use section 2 |
| Unauthorized on cron | Wrong secret | Match `Authorization: Bearer` to `SYNC_CRON_SECRET` |

---

## Notes

- Run SoccerData imports on your **local machine** or a VM, not Vercel — scraping can exceed serverless timeouts.  
- **Canonical IDs stay SofaScore/SportAPI** (`team_id`, `event_id`). SoccerData enriches via mapping tables.  
- To add SoccerData support for more competitions, edit `src/lib/config/soccerdata-leagues.ts` (map `LEAGUE_ID` → strings like `ENG-Premier League`).
