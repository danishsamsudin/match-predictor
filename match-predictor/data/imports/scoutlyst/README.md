# Scoutlyst player stat imports

Weekly workflow to load Scoutlyst CSV exports into Supabase (`scoutlyst_player_snapshots`).

## Folder layout (recommended)

Put **one folder per league**, with as many CSV files as you need (position groups, metrics slices, etc.):

```text
data/imports/scoutlyst/incoming/
  premier-league/
    attackers.csv
    midfielders.csv
    defenders.csv
    ...
  la-liga/
    squad-ratings.csv
    ...
  bundesliga/
    ...
```

`npm run scoutlyst:import` walks **every league folder** and imports **every `.csv`** inside it.

Optional per-league override — create `league.json` in the folder:

```json
{ "leagueId": 39 }
```

### Mapping folder names → league IDs

Edit [`league-folders.json`](./league-folders.json). Keys are folder names (case-insensitive); values are reference league IDs from the app (e.g. `39` = Premier League).

Built-in aliases include `premier-league`, `la-liga`, `39`, `pl`, etc. Add your own if Scoutlyst exports use different folder names.

Unknown folders are **skipped** with an error (so bad data does not import without a league). To force import anyway:  
`POST /api/cron/scoutlyst-import?allowUnmapped=true`

## 1. Export from Scoutlyst

Export as **CSV** (not `.xlsx`).

## 2. Drop files

Files in `incoming/` are gitignored.

## 3. Run the import

```bash
npm run scoutlyst:import
```

Preview pending files without importing:

```bash
curl http://localhost:3000/api/cron/scoutlyst-import
```

Successful files move to `archive/<league-folder>/`.

## Single-file upload (API)

```bash
curl -X POST "http://localhost:3000/api/scoutlyst/import" \
  -H "Authorization: Bearer $SYNC_CRON_SECRET" \
  -F "file=@path/to.csv" \
  -F "leagueId=39"
```

## Column mapping

| Field | Accepted column names |
|-------|------------------------|
| Player ID | `id`, `player_id`, `player id` |
| Name | `name`, `player`, `player_name` |
| Team | `team`, `club`, `team_name` |
| League | `league`, `competition` |
| Rating | `rating`, `performance_rating`, `score` |

Other columns → `stats` jsonb.

## Weekly automation

| Environment | Approach |
|-------------|----------|
| **Local Mac** | `0 8 * * 1 cd …/match-predictor && npm run scoutlyst:import` |
| **Vercel** | Use `POST /api/scoutlyst/import` per file, or deploy with CSVs in repo (unusual) |

## Linking to SofaScore lineups

Run football sync first; imports match `(team_id, player name)` from `synced_event_lineups`.
