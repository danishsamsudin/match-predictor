# What we shipped today — 22 July 2026

This is a cofounder-facing rundown of everything Danish worked on today across Cursor threads. Scope is the **Graham League Prediction Model (GLPM)** club product (Premier League, Championship, Serie A, Bundesliga, Eredivisie), plus the homepage and ops automation around it.

World Cup / national-team predictor was not the focus today.

---

## Executive summary

Today we turned GLPM from “trained seasons sitting in the DB” into a **live product surface + daily ops loop**:

1. **Homepage** redesigned around tabbed fixtures + standings, with filled prediction cards, weather, and local kickoff times.
2. **Venues + weather** so Open-Meteo forecasts attach to the **home stadium**.
3. **Standings** computed from finished `glpm_matches`, with week-over-week position movement arrows, and UI preference for the **2026/27** schedule season.
4. **SportMonks daily sync** (morning / lineup / results / night retrain + repredict) via GitHub Actions.
5. **Standings refresh** automation (GitHub → Vercel cron) sized for multi-league matchdays.
6. **League-run pipeline** improvements (verbose progress, PDF export, opponent-strength crash fix, model introspection).
7. **100 unique transparent 25/26 club logos** downloaded and wired into `public/team-logos`.
8. Planning / research threads on **livescore** and an **AI betting chatbot** (not implemented yet).

Code is on `main` and deployed via Vercel production.

### Publish links (end of day)
- **GitHub:** https://github.com/danishsamsudin/match-predictor (`main` @ `afd150b`)
- **Production:** https://match-predictor-ten.vercel.app
- **This write-up:** [`docs/TODAY_2026-07-22_COFOUNDER_UPDATE.md`](./TODAY_2026-07-22_COFOUNDER_UPDATE.md)
- Supabase migrations `041`–`044` are already applied on the production Match Predictor project.

---

## 1. Homepage: tabbed fixtures + standings

**Threads:** [Homepage tabbed fixtures](de53d717-f5f2-433b-acaa-bd1b42cf9273), [Upcoming match days](3743a842-474f-4b27-9e78-dc564e37b8eb)

### What changed
- Replaced five separate league sections with **one Upcoming Fixtures panel** and **one League Standings panel**.
- Shared **league pill tabs** (`HomeLeagueTabs`) switch both panels together.
- Fixtures show the **first two local dates that actually have upcoming matches** for the selected league (not “today + tomorrow” empty calendar days).
- Standings columns: `#`, Team, P, W, D, L, GF, GA, GD, Pts, last-5 form.
- Standings are built from finished **`glpm_matches`** (our data), not a third-party standings scrape for the table body.

### Key files
- `src/app/page.tsx`
- `src/components/glpm/HomeLeagueTabs.tsx`
- `src/components/glpm/HomeLeagueFixturesPanel.tsx`
- `src/components/glpm/HomeLeagueStandingsPanel.tsx`
- `src/lib/glpm/compute-standings.ts`
- `src/lib/glpm/load-standings.ts`
- `src/lib/glpm/build-season-standings.ts`

---

## 2. Prediction cards: fill data + redesign UI

**Threads:** [Fill/redesign cards](8185b760-5f9d-4bde-8228-287e68d86584), [Card height + scroll](fb3994f5-1c17-46f3-ad64-129c68a8a2e6), [Date plaque](70c3c97c-321a-433e-8818-3a64ce5aaeb9), [Hydration/script fixes](9b00ab46-3616-48ed-beb3-9fe10cb27f00)

### Problems fixed
- Cards were often **empty** (predictions / vectors not resolving onto the hub).
- Layout felt cramped; date chip sat poorly on the rail; cards were too short.
- React 19 **script-in-component** warning and **hydration mismatch** on date formatting (server locale vs browser locale).

### What shipped
- Hub load now resolves prediction snapshots / rating vectors onto upcoming fixtures (`hub-prediction-map`, `hub-vector-resolve`).
- Card front: full local date like **Monday 8 June**, local kickoff time, stadium, centered home / vs / away stack, weather strip, flip for markets.
- Fair odds (1 / X / 2) on a compact three-column row.
- Horizontal scrolling row of taller cards (not day-sliced vertical stacks).
- Date plaques vertically centered on the card rail (`1fr / auto / 1fr`).
- Theme boot script moved to a plain `<script>` in `layout.tsx` `<head>` (avoids `next/script` client render issue).
- Kickoff date helpers made **hydration-safe** (`kickoff-display.ts`).
- Always-on dash style rule: use ` - ` only (no em/en dashes) via `.cursor/rules/no-em-dashes.mdc`.

### Key files
- `src/components/glpm/GlpmUpcomingFixturesSection.tsx`
- `src/lib/glpm/hub-load.ts`, `hub-types.ts`, `hub-prediction-map.ts`, `hub-vector-resolve.ts`, `hub-weather.ts`
- `src/lib/utils/kickoff-display.ts` (+ tests)
- `src/app/globals.css`, `src/app/layout.tsx`

---

## 3. Venues, stadium locations, and weather

**Threads:** [Do we have venues?](d80275a4-8830-4bb4-88b2-cc5c2616a73b), [Venue locations + weather](8185b760-5f9d-4bde-8228-287e68d86584)

### What shipped
- New **`glpm_venues`** table (migration `042_glpm_venues.sql`).
- Sync script + curated `data/glpm/venues.json` with researched lat/lon for home grounds.
- Weather on cards always uses the **home venue** coordinates.
- If kickoff is further than ~16 days out → show **TBC** instead of a fake forecast.
- Manual overrides for awkward SportMonks venue IDs (`venue-location-overrides.ts`).

### Key files
- `supabase/migrations/042_glpm_venues.sql`
- `scripts/glpm-sync-venues.ts`
- `data/glpm/venues.json`
- `src/lib/glpm/venue-location-overrides.ts`
- `src/lib/glpm/hub-weather.ts`

---

## 4. Standings season cutover + movement arrows

**Thread:** [Standings season + arrows](c6e8bcca-8a56-41cd-a6e5-5ef6845be5f1)

### Problems
- Some leagues showed finished **25/26** tables while others looked empty (no 26/27 results yet).
- Wanted visual **up / down** movement when a team changes league position after new results land.

### What shipped
- Homepage prefers the **upcoming schedule season (2026/27)** for fixtures/standings context when available.
- Standings snapshots stored with previous rank for movement (`043_glpm_standings.sql`).
- UI triangles for week-to-week (or refresh-to-refresh) rank change (`standings-movement.ts`).
- Refresh path: recompute standings after ingesting latest finished matches.
- GitHub workflow + Vercel cron for standings refresh (see §6).

### Key files
- `src/lib/glpm/standings-movement.ts` (+ tests)
- `src/lib/glpm/refresh-standings.ts`
- `supabase/migrations/043_glpm_standings.sql`
- `src/app/api/cron/glpm-standings-refresh/route.ts`
- `.github/workflows/glpm-standings-refresh.yml`

**Note for ops:** GitHub Action needs `APP_URL` (production origin) and `SYNC_CRON_SECRET` / `CRON_SECRET` repo secrets.

---

## 5. SportMonks daily sync + night retrain / repredict

**Thread:** [Daily GitHub SportMonks sync](0e413030-0d6e-4acb-ba1e-03df154ff4d3)

### Product intent
Automate the matchday loop for all five leagues:

| Phase | Purpose |
|---|---|
| **Morning** | Discover today’s slate (in configured IANA timezone) |
| **Lineup** | Pull confirmed XIs when due (~pre-kickoff window) |
| **Results** | Ingest finished scores / stats |
| **Night refresh** | Retrain ratings from new finished games, then rewrite upcoming prediction snapshots |

Timezone is **user/locale configured** via `GLPM_MATCHDAY_TIMEZONE` (e.g. `Africa/Lagos`, `Europe/Berlin`), not hard-coded UTC for “what day is today.”

### What shipped
- Matchday window logic, daily sync orchestration, night refresh, upcoming prediction snapshot runner.
- GitHub Actions workflow `glpm-sportmonks-daily.yml` (morning + dispatcher every 15m during EU hours).
- Migration `044_glpm_daily_sync_windows.sql` for sync bookkeeping.
- Vercel cron for upcoming predictions: `/api/cron/glpm-upcoming-predictions` at `30 5 * * *`.
- npm scripts: `glpm:sm-daily-sync`, `glpm:night-refresh`, `glpm:upcoming-predictions`, plus GK/team-stats backfill helpers.

### Explicit gap (documented today, not built yet)
Afternoon **lineup ingest does not yet force-rescore** upcoming markets from XI. Ratings are still **team-level**; the night refresh is the prediction rewrite. XI-driven pre-match rescoring is a follow-up if we want confirmed lineups to move odds before kickoff.

### Key files
- `src/lib/glpm/sportmonks/dailySync.ts`, `dailySyncWindow.ts`, `matchday.ts`, `nightRefresh.ts`, `fixtureSchedule.ts`, `ingestFixturesBatch.ts`
- `scripts/glpm-sportmonks-daily-sync.ts`, `glpm-night-refresh.ts`, `glpm-upcoming-predictions.ts`
- `.github/workflows/glpm-sportmonks-daily.yml`
- `supabase/migrations/044_glpm_daily_sync_windows.sql`
- `src/app/api/cron/glpm-upcoming-predictions/route.ts`
- `vercel.json` (new cron entries)

**Required GitHub secrets for daily sync:** `SPORTMONKS_API_TOKEN`, `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `GLPM_MATCHDAY_TIMEZONE`.

---

## 6. Standings refresh automation (efficient matchday updates)

**Thread:** [Standings refresh efficiency](c6e8bcca-8a56-41cd-a6e5-5ef6845be5f1)

### Design
- GitHub Action stays **cheap**: it mostly `curl`s production cron endpoints; heavy work runs on **Vercel**.
- Schedule denser on Fri–Sun / midweek European windows, lighter Mon/Thu catch-up.
- Avoids overloading GitHub Actions minutes and SportMonks rate limits.

### Also
- Documented where to get `APP_URL`: it is the **production site origin** from Vercel (not a third-party API key).

---

## 7. League-run pipeline, training fixes, reports, introspection

**Threads:** [Season model Q&A](ca4ef0b8-30fb-47b0-b4d9-120ae4c2a669), [League-run crash](fd012c1b-0edb-4793-9620-c5ea07ff93f8), [Verbose league-run](cb42ad09-9902-4866-a231-d8235381c29f), [PDF layout](5e1a0687-ed16-4fac-adf3-3486b6bc7fd7)

### Season / training behaviour clarified
- Each league keeps its **own** trained artifacts / vectors (not one shared weight dump across competitions).
- `glpm:league-run` on a brand-new 26/27 season **will fail preflight** until ~20 completed matches (~40 team-rows with xG/shots). That is intentional and does **not** corrupt 25/26 models.
- Until cutover, keep predicting on **25/26 vectors**; switch by pointing season IDs / assemble+predict at the new season once enough games exist.
- Backfill / schedule refresh can run without training.

### Bugs fixed
- Opponent-strength adjust merge crash on duplicate `(opponent_team_sm_id, match_date)` rows (Serie A / season `25646` style data). Dedup + `many_to_one` validation across attack / defence / finishing / pressing / possession / build-up adjust paths.
- Goalkeeper IO hardening for training/load paths.

### DX / reporting
- `glpm:league-run` now prints a full step plan, `[n/N]` banners, live child stdout, and timing.
- League-run markdown → PDF export improved (fit tables, denser “insight” layout, named starting GKs). Scripts: `glpm:export-league-run-pdf`, `export-glpm-league-run-pdf.mjs`.
- Model introspection tooling: `models/ratings/introspection.py`, `feature_explanations.py`, `glpm:introspect`, tests.

### Key files
- `scripts/glpm-league-run.ts`, `glpm_write_league_run_report.py`, `export-glpm-league-run-pdf.mjs`
- `models/ratings/*/adjust.py`, `models/ratings/goalkeeper/io.py`
- `models/ratings/introspection.py`, `feature_explanations.py`
- `scripts/glpm_introspect_models.py`, `scripts/ml/run-introspect.sh`

---

## 8. Team logos (25/26, all five leagues)

**Thread:** [Download 25/26 logos](939a4620-5d9b-41bd-966f-932fa9cb1ec9)

### What shipped
- **100 clubs** downloaded, matched to SofaScore team IDs, verified **unique + transparent PNG**.
- Served from existing web path: `public/team-logos/{sofascoreTeamId}.png`.
- Curated copies by league under `data/glpm/team-logos-2526/` + `manifest.json`.
- Script: `npm run logos:download:2526` → `scripts/download-glpm-2526-team-logos.py`.

| League | Teams |
|---|---:|
| Premier League | 20 |
| Championship | 24 |
| Serie A | 20 |
| Bundesliga | 18 |
| Eredivisie | 18 |

---

## 9. Ingest / SportMonks layer hardening

Supporting work that landed with the above (not always its own thread):

- Fixture upsert / schedule ingest improvements (`upsertFixture.ts`, SportMonks client/types/statTypes).
- PPDA / proxy source migration `041_glpm_ppda_source_proxy.sql`.
- Lineup player stats mapping + proxy helpers.
- Backfill CLIs for GK stats, team stats, ensure GK players.
- Validation rule tweaks; expanded Vitest / pytest coverage around SportMonks, standings, kickoff display, attack ratings, introspection.
- Cofounder guide (`docs/GLPM_COFOUNDER_GUIDE.md`) updated for the newer pipeline.

---

## 10. Research only (not implemented today)

### Livescore for ongoing matches
**Thread:** [Livescore feasibility](cc7d3a2f-16cc-4391-9883-590df71ecdc9)

- Feasible on Vercel, but needs a push/poll architecture that respects SportMonks **2,000 req/hour**.
- Clarified Vercel Cron limits: not a bug; Hobby/cron cannot do sub-minute score publish. Live UX needs client polling / Realtime / external worker, not `*/30 * * * * *` cron.

### AI betting chatbot (Gemini-style)
**Thread:** [AI chatbot for bet questions](cf2bf8ba-0784-438a-8244-cc9c43bd2df1)

- Free Vercel + Supabase can host an MVP chat UI; first walls are usually **LLM cost/rate limits**, then DB egress if each message runs heavy queries.
- “Training the LLM” for this product is realistically **RAG + tools over our predictions/ratings**, not fine-tuning from scratch.
- Not built today; architecture discussion only.

---

## Database migrations added today (and yesterday evening carry-over)

| Migration | Purpose |
|---|---|
| `041_glpm_ppda_source_proxy.sql` | PPDA / proxy source tracking |
| `042_glpm_venues.sql` | Stadium venues + lat/lon for weather |
| `043_glpm_standings.sql` | Standings snapshots + movement |
| `044_glpm_daily_sync_windows.sql` | Daily sync window bookkeeping |

These must be applied on the production Supabase project for Vercel cron / standings / weather paths to work fully.

---

## New npm scripts (high signal)

- `logos:download:2526`
- `glpm:sm-daily-sync`
- `glpm:night-refresh`
- `glpm:standings-refresh`
- `glpm:upcoming-predictions`
- `glpm:sync-venues`
- `glpm:league-run`
- `glpm:introspect`
- `glpm:export-league-run-pdf`
- `glpm:sm-backfill-gk` / `glpm:sm-backfill-team-stats` / `glpm:sm-ensure-gk-players`

---

## New / updated automation

### Vercel crons (`vercel.json`)
- `GET /api/cron/glpm-standings-refresh` — `15 4 * * *`
- `GET /api/cron/glpm-upcoming-predictions` — `30 5 * * *`
- (existing weekly SportMonks refresh crons unchanged)

### GitHub Actions
- `.github/workflows/glpm-sportmonks-daily.yml` — morning + matchday dispatcher + night refresh
- `.github/workflows/glpm-standings-refresh.yml` — curl production standings/ingest cron on a matchday-aware schedule

---

## Suggested cofounder walkthrough (10 minutes)

1. Open production homepage → switch league tabs → confirm fixtures are the next two **match** days and cards show probs / fair odds / weather or TBC.
2. Check standings panel for 26/27 season context + movement triangles after a refresh.
3. In GitHub → Actions: confirm the two new workflows exist; verify secrets (`APP_URL`, cron secret, SportMonks, Supabase, `GLPM_MATCHDAY_TIMEZONE`).
4. Skim this file + `docs/GLPM_COFOUNDER_GUIDE.md` for the longer model story.
5. Decide next product bets: **XI-driven pre-match rescoring**, **livescore**, or **AI chatbot**.

---

## Intentionally not committed

Local training artifacts that stay on disk only (too large / regenerable):

- `data/reports/.glpm-artifact-snapshots/**` (joblib model dumps)
- Large introspection JSON dumps under `data/reports/`
- Generated PDF/HTML previews under `data/reports/` and `export/`

Reproduce via `npm run glpm:league-run` / `glpm:introspect` / `glpm:export-league-run-pdf` when needed.

---

*Generated for cofounder sync — 22 July 2026.*
