# NL Post-Match Learning (Cursor workflow)

Use after each UEFA Nations League 2026/27 match when the user saves Opta HTML to Downloads.

**Note:** `NL-Opta-Results` and `NL-Opta-Player-Stats` are gitignored local ingest folders. Parsed data lives in Supabase after `nl:postmatch`; production does not read these HTML files.

## User workflow

1. Save the **Opta Analyst stats article** as HTML (complete page with its `_files` folder).
   - Copy into `data/nations-league-2026/NL-Opta-Results/`
2. Save **three Betting Showcase pages** (Web Page, Complete + `_files` each):
   - `NL-Opta-Player-Stats/Match Summary/`
   - `NL-Opta-Player-Stats/Opta Summary/`
   - `NL-Opta-Player-Stats/Match Details/`
   - Filename pattern: `{Home} vs {Away} - {DD Mon YYYY} - UEFA Nations League ...`
3. Run one command (or ask the agent to run it).

## Commands

From the **repo root** (the folder that contains `package.json`):

```bash
# Full pipeline - all HTML in NL-Opta-Results + player-stats folders (recommended)
npm run nl:postmatch
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
- Migration `061_nations_league_player_prop_evaluations.sql` applied (player-prop evaluate/calibrate).
- Opta HTML must include the embedded match centre iframe (`saved_resource(1).html` in `_files` for articles; Betting Showcase pages need their `_files` bundles).
- Fixture rows must already exist in `matches` with `competition` containing `Nations League` (import via martj42 / footystats / seed scripts first).
- **No dev server required** - `nl:postmatch` refreshes the hub snapshot directly via Supabase.

## What the pipeline does

1. **Ingest articles** - Parses Analyst article + Opta widget (shared WC parsers); updates `matches`, `national_match_process_metrics`, `nations_league_post_match_ingests`. Optionally writes set-piece rates into `nations_league_calibration_config`.
2. **Ingest player stats** - Parses Match Summary, Opta Summary, Match Details; upserts `nations_league_player_match_stats`, `nations_league_team_match_aggregates`, `nations_league_player_tournament_form`.
3. **Ratings** - Recomputes NL-weighted xG-Elo / WCTR / talent via `nl:recompute-ratings`.
4. **Hub refresh** - Calls `refreshNationsLeagueHubSnapshot()` to rebuild `nations_league_hub_snapshot` (new scheduled preds lock `snapshot.player_props`).
5. **Player props evaluate** - Scores locked (or recomputed) anytime / SoT lines vs Opta into `nations_league_player_prop_evaluations` (full XI candidates when present).
6. **Player props calibrate** - Retrains anytime-scorer ML coeffs into `nations_league_calibration_config` when enough eval rows exist (≥8).

## Remaining mapping (vs full WC pipeline)

Not yet mirrored for NL (document so agents do not invent stubs mid-match):

- No `nations_league_team_discipline` table (WC writes `world_cup_team_discipline`).
- No full market-model / Graham calibrate / ml-train steps beyond player-prop calibrate in `nl:postmatch`.
- Hub Model-XI / lineup impact helpers (`resolve-wc-lineup-player-stats` equivalents) still TBD.
- Official fixture orientation uses DB home/away only (no WC `fixture-venues.json` aligner).

## Parser failures

If ingest fails:

1. Read the HTML structure (article body + widget, or Betting Showcase `Opta-Stat-*` tables).
2. Extend `src/lib/world-cup/opta-html-parser.ts` or `opta-player-stats-parser.ts` (shared with WC).
3. Add a fixture snippet under `src/lib/world-cup/__fixtures__/` or `src/lib/nations-league/__fixtures__/`.
4. Run `npm test -- src/lib/world-cup/opta-player-stats-parser.test.ts`.

## Prediction surface

NL `/nations-league` hub predictions use the Graham model with NL calibration / form weights. Pre-match snapshots live in `nations_league_predictions`.
