# WC Post-Match Learning (Cursor workflow)

Use after each FIFA World Cup 2026 match when the user saves Opta Analyst HTML to Downloads.

## User workflow

1. Save the Opta Analyst stats article as HTML (complete page with its `_files` folder).
2. Copy **both** the `.html` file and the matching `_files` folder into `data/world-cup-2026/WC-Opta-Results/`.
   - Example: `Mexico 2-0 South Africa....html` + `Mexico 2-0 South Africa....html_files/`
   - In Safari/Chrome use **Save As → Web Page, Complete**
3. Run one command (or ask the agent to run it).

## Commands

From the **app root** (`match-predictor/match-predictor/` — the folder that contains `package.json`):

```bash
cd /Users/danishsamsudin/match-predictor/match-predictor

# Full pipeline — all HTML in WC-Opta-Results (recommended)
npm run wc:postmatch
```

Optional: pass explicit file paths instead of scanning the folder:

```bash
npm run wc:postmatch -- ~/Downloads/"Mexico 2-0 South Africa Stats_....html"
```

Or step by step:

```bash
npm run wc:ingest-opta -- data/world-cup-2026/WC-Opta-Results/"....html"
npm run xg-elo:recompute
npm run wc:evaluate
npm run wc:calibrate
npm run wc:sync
```

## Requirements

- `.env.local` with `SUPABASE_SERVICE_ROLE_KEY` (and related Supabase vars).
- Migrations applied including `024_world_cup_post_match_learning.sql`.
- Opta HTML must include the embedded match centre iframe (`saved_resource(1).html` in `_files`).

## What the pipeline does

1. **Ingest** — Parses article + Opta widget; updates `matches`, `national_match_process_metrics`, `world_cup_team_discipline`, `world_cup_post_match_ingests`.
2. **Ratings** — Recomputes xG-Elo / WCTR / talent via `xg-elo:recompute`.
3. **Evaluate** — Scores locked `world_cup_predictions` vs actual (1X2, scoreline, O/U 2.5, BTTS, handicaps).
4. **Calibrate** — Bounded tuning of Graham constants when ≥2 evaluations exist.
5. **Sync** — Refreshes pre-kickoff `world_cup_predictions` and tournament forecast.

## Reporting back to the user

After running, summarize:

- Parsed score and xG vs what was in the DB before
- Evaluation metrics (composite loss, Brier 1X2) per match
- Whether calibration changed `muXg` / `strengthExponent`
- Any parser warnings

## Parser failures

If ingest fails:

1. Read the HTML structure (article body + `saved_resource(1).html` widget).
2. Extend `src/lib/world-cup/opta-html-parser.ts`.
3. Add a fixture snippet under `src/lib/world-cup/__fixtures__/opta-html/`.
4. Run `npm test -- src/lib/world-cup/opta-html-parser.test.ts`.

## Prediction surface

WC `/predict` links from the hub use the **Graham model** (same as cards). Pre-match snapshots live in `world_cup_predictions` and lock after kickoff.
