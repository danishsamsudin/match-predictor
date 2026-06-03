# FIFA men's world ranking

## Sources

| Source | Years | File |
|--------|-------|------|
| Kaggle | 1992–2024 | `fifa_mens_rank.csv` (auto-downloaded) |
| FIFA/Coca-Cola (saved HTML) | 2026 snapshot | `../fbref/world-cup/FIFA_Coca-Cola Men's World Ranking.html` |

## Import

1. Apply migrations `015`, `016`, and `017` in Supabase (`017` allows tied ranks in Kaggle history).
2. From `match-predictor/`:

```bash
pip install kagglehub supabase python-dotenv
source .env.local
npm run fifa:import
```

This imports **both** Kaggle history and the FIFA 2026 HTML snapshot by default. Regenerate the bundled JSON after updating the official FIFA HTML:

```bash
npm run fifa:json
# then import into Supabase:
npm run fifa:import
```

The app bundles `fifa-rankings-2026.json` at build time for **latest official ranks** (production-safe). After updating the FIFA HTML, regenerate and **commit** the JSON:

```bash
npm run fifa:json
git add data/imports/fifa/fifa-rankings-2026.json
```

Supabase Kaggle history is only used for past match-date lookups (vs-top-20 stats).

### Options

```bash
# Dry run
python3 scripts/import_fifa_rankings.py --dry-run

# Kaggle only
python3 scripts/import_fifa_rankings.py --skip-sofascore

# Sofascore 2026 only (e.g. after Kaggle already loaded)
python3 scripts/import_fifa_rankings.py --skip-kaggle
```

## What the app uses

- **Latest snapshot** = bundled `fifa-rankings-2026.json` (official FIFA 2026 H1 HTML). Not read from Supabase at runtime.
- National-team **Ω strength** in predictions uses those points vs #1.
- **Vs top-20** stats use historical ranks at each match date from Supabase Kaggle history (falls back to 2024 H2 when no row exists for that date).

## Verify

```sql
SELECT ranking_year, semester, data_source, rank, team_name, total_points
FROM fifa_ranking_snapshots
WHERE ranking_year >= 2024
ORDER BY ranking_year DESC, semester DESC, rank
LIMIT 10;
```

Expected top row after full import: France ~1877 pts, `data_source = fifa`, `ranking_year = 2026`.
