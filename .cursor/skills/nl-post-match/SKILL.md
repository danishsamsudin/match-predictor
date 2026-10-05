# NL Post-Match Learning (Cursor workflow)

Use after each UEFA Nations League 2026/27 match when the user saves Opta HTML to Downloads.

**Note:** `NL-Opta-Results`, `NL-Opta-Player-Stats`, and `nl-scoutlyst-rankings` are gitignored local ingest folders. Parsed data lives in Supabase after `nl:postmatch`; production does not read these HTML files.

## User workflow

1. Save the **Opta Analyst stats article** as HTML (complete page with its `_files` folder).
   - Copy into `data/nations-league-2026/NL-Opta-Results/`
2. Save **three Betting Showcase pages** (Web Page, Complete + `_files` each):
   - `NL-Opta-Player-Stats/Match Summary/`
   - `NL-Opta-Player-Stats/Opta Summary/`
   - `NL-Opta-Player-Stats/Match Details/`
   - Filename pattern: `{Home} vs {Away} - {DD Mon YYYY} - UEFA Nations League ...`
   - Month may be `Sep`, `Sept`, or `September` (Opta often uses `Sept`).
   - `nl:postmatch` audits these folders first: incomplete three-page sets, duplicate files for the same match in one folder, pages saved in the wrong folder, and missing `_files` bundles. It aborts with a clear report until those are fixed.
3. Optional: refresh SoFIFA overalls - save SoFIFA `/players` listing pages (Web Page, Complete) into `nl-scoutlyst-rankings/`, or run `npm run nl:fetch-sofifa` then `npm run nl:import-sofifa`.
4. Articles are optional. If `NL-Opta-Results` is empty, `nl:postmatch` skips article ingest and still marks matches finished from Betting Showcase scores.
5. Run one command (or ask the agent to run it).

## Commands

From the **repo root** (the folder that contains `package.json`):

```bash
# Full pipeline - all HTML in NL-Opta-Results + player-stats folders (recommended)
npm run nl:postmatch
```

Optional Sofifa-only:

```bash
npm run nl:import-sofifa
npm run nl:fetch-sofifa -- --print-urls-only
```

Optional: pass explicit article paths instead of scanning NL-Opta-Results:

```bash
npm run nl:postmatch -- ~/Downloads/"Spain 2-1 Portugal Stats_....html"
```

Or step by step:

```bash
npm run nl:ingest-opta -- data/nations-league-2026/NL-Opta-Results/"....html"
npm run nl:ingest-player-stats
npm run nl:recompute-ratings
```

## Requirements

- `.env.local` with `SUPABASE_SERVICE_ROLE_KEY` (and related Supabase vars).
- Migration `060_nations_league_bettor_core.sql` applied (NL ingest + player-stats tables).
- Migration `061_nations_league_player_prop_evaluations.sql` applied (player-market scoring).
- Migration `063_nations_league_match_market_learning.sql` applied (match-market scoring, side-market scoring, and machine-learning snapshots).
- Opta HTML must include the embedded match centre iframe (`saved_resource(1).html` in `_files` for articles; Betting Showcase pages need their `_files` bundles).
- Fixture rows must already exist in `matches` with `competition` containing `Nations League` (import via martj42 / footystats / seed scripts first).
- **No dev server required** - `nl:postmatch` refreshes the hub snapshot directly via Supabase.

## What the pipeline does

0. **Audit player-stats folders** - Reports (and aborts on) incomplete three-page sets, duplicate HTML for the same match in one folder, pages whose content does not match the folder (wrong save), unparsed filenames, and missing `_files` bundles.
1. **Ingest articles** - Parses Analyst article + Opta widget (shared WC parsers); updates `matches`, `national_match_process_metrics`, `nations_league_post_match_ingests`. Optionally writes set-piece rates into `nations_league_calibration_config`.
2. **SoFIFA overalls** - Parses `nl-scoutlyst-rankings` player listing HTML into `soccerdata_players` (fills squad picker performance scores).
3. **Ingest player stats** - Parses Match Summary, Opta Summary, Match Details; upserts `nations_league_player_match_stats`, `nations_league_team_match_aggregates`, `nations_league_player_tournament_form`.
4. **Ratings** - Recomputes NL-weighted xG-Elo / WCTR / talent via `nl:recompute-ratings`.
5. **Refresh upcoming odds** - Recomputes Graham + player markets + side markets for fixtures that have not kicked off. Finished / live lines stay frozen.
6. **Score finished match odds** - Home / draw / away, scorelines, over-under, both teams to score, handicaps → `nations_league_prediction_evaluations`.
7. **Score side markets** → `nations_league_market_evaluations` (including double chance, goal ranges, team totals, European handicap).
8. **Score player markets** - Anytime goal, anytime assist, goal or assist, shots on target. Bootstrap only when no pre-kickoff lock exists (marked bootstrap).
9. **Retune main match model** - Walk-forward Graham calibrate into `nations_league_calibration_config`.
10. **Retune side markets and player markets**.
11. **Rebuild confidence layer** - Reliability bins vs real hits; Strong / Moderate / Weak / None floors with holdout guard. Extra alias: `nl:calibrate-confidence`.
12. **Machine-learning check** - Backfill frozen snapshots and deploy a small nudge only if recent test matches do not get worse.
13. **Hub republish + plain-language summary** printed at the end of the terminal run.

`npm run nl:postmatch` is the only user command. Extra aliases (`nl:evaluate`, `nl:calibrate`, `nl:ml-train`, `nl:calibrate-confidence`) are for debugging.

## Remaining mapping (vs full WC pipeline)

- No `nations_league_team_discipline` table (WC writes `world_cup_team_discipline`).
- Hub Model-XI / lineup impact helpers (`resolve-wc-lineup-player-stats` equivalents) still TBD.
- Official fixture orientation uses DB home/away only (no WC `fixture-venues.json` aligner).
- **MD1 baseline XIs** - scraped via `npm run nl:scrape-md1-lineups` into `data/nations-league-2026/md1-starting-xis.json` and used as the default NL squad/XI (`squadSource: nl_md1`). Resume with `nl:scrape-md1-lineups:resume`; backfill teams that skipped MD1 (first-match XI) with `nl:backfill-baseline-xis`; upsert DB with `nl:upsert-md1-lineups`. Seed Predict picker fixtures with `nl:seed-synced-fixtures`.

## Parser failures

If ingest fails:

1. Read the HTML structure (article body + widget, or Betting Showcase `Opta-Stat-*` tables).
2. Extend `src/lib/world-cup/opta-html-parser.ts` or `opta-player-stats-parser.ts` (shared with WC).
3. Add a fixture snippet under `src/lib/world-cup/__fixtures__/` or `src/lib/nations-league/__fixtures__/`.
4. Run `npm test -- src/lib/world-cup/opta-player-stats-parser.test.ts`.

## Prediction surface

NL `/nations-league` hub predictions use the Graham model with NL calibration / form weights. Pre-match snapshots live in `nations_league_predictions`.
