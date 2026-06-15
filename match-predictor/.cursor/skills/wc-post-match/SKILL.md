# WC Post-Match Learning (Cursor workflow)

Use after each FIFA World Cup 2026 match when the user saves Opta HTML to Downloads.

## User workflow

1. Save the **Opta Analyst stats article** as HTML (complete page with its `_files` folder).
   - Copy into `data/world-cup-2026/WC-Opta-Results/`
2. Save **three Betting Showcase pages** (Web Page, Complete + `_files` each):
   - `WC-Opta-Player-Stats/Match Summary/`
   - `WC-Opta-Player-Stats/Opta Summary/`
   - `WC-Opta-Player-Stats/Match Details/`
   - Filename pattern: `{Home} vs {Away} - {DD Mon YYYY} - FIFA World Cup 2026 ...`
3. Run one command (or ask the agent to run it).

## Commands

From the **app root** (`match-predictor/match-predictor/` — the folder that contains `package.json`):

```bash
cd /Users/danishsamsudin/match-predictor/match-predictor

# Full pipeline — all HTML in WC-Opta-Results + player-stats folders (recommended)
npm run wc:postmatch
```

Optional: pass explicit article paths instead of scanning WC-Opta-Results:

```bash
npm run wc:postmatch -- ~/Downloads/"Mexico 2-0 South Africa Stats_....html"
```

Or step by step:

```bash
npm run wc:ingest-opta -- data/world-cup-2026/WC-Opta-Results/"....html"
npm run wc:ingest-player-stats
npm run wc:recompute-wc-form
npm run xg-elo:recompute
npm run wc:evaluate
npm run wc:calibrate
npm run wc:sync
```

## Requirements

- `.env.local` with `SUPABASE_SERVICE_ROLE_KEY` (and related Supabase vars).
- Migrations applied including `024_world_cup_post_match_learning.sql` and `025_world_cup_player_match_stats.sql`.
- Opta HTML must include the embedded match centre iframe (`saved_resource(1).html` in `_files` for articles; Betting Showcase pages need their `_files` bundles).
- **No dev server required** — `wc:postmatch` runs hub sync directly via Supabase.

## What the pipeline does

1. **Ingest articles** — Parses Analyst article + Opta widget; updates `matches`, `national_match_process_metrics`, `world_cup_team_discipline`, `world_cup_post_match_ingests`.
2. **Ingest player stats** — Parses Match Summary, Opta Summary, Match Details; upserts `world_cup_player_match_stats`, `world_cup_team_match_aggregates`, `world_cup_player_tournament_form`.
3. **Recompute form** — Rebuilds tournament composites and player form (idempotent).
4. **Ratings** — Recomputes xG-Elo / WCTR / talent via `xg-elo:recompute`.
5. **Evaluate** — Scores locked `world_cup_predictions` vs actual (1X2, scoreline, O/U 2.5, BTTS, handicaps).
6. **Calibrate** — Bounded tuning of Graham + WC form constants when ≥2 evaluations exist.
7. **Sync** — Refreshes pre-kickoff `world_cup_predictions` (with model-XI lineup impact) and tournament forecast.

## Reporting back to the user

After running, summarize:

- Articles and player-stats fixtures ingested (counts, any skips)
- Parsed score and xG vs what was in the DB before
- Composite coverage per team; player xG sum drift warnings
- Evaluation metrics (composite loss, Brier 1X2) per match
- Whether calibration changed `muXg`, `strengthExponent`, or WC form weights
- Any parser warnings

## Parser failures

If ingest fails:

1. Read the HTML structure (article body + widget, or Betting Showcase `Opta-Stat-*` tables).
2. Extend `src/lib/world-cup/opta-html-parser.ts` or `opta-player-stats-parser.ts`.
3. Add a fixture snippet under `src/lib/world-cup/__fixtures__/`.
4. Run `npm test -- src/lib/world-cup/opta-player-stats-parser.test.ts`.

## Prediction surface

WC `/predict` links from the hub use the **Graham model** (same as cards). Pre-match snapshots live in `world_cup_predictions` and lock after kickoff. **Model XI** projects last-match WC starters and applies tournament-form lineup impact; **Manual XI** prefers WC tournament form over Scoutlyst/FBref when coverage is sufficient.
