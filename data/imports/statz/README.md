# Statz team-form imports

Parsed JSON from saved Statz.ai team pages (HTML Complete). The HTML stays in Downloads; this folder keeps the structured extract so extra fields (free kicks, duels, Statz xG, shots in/out of box, and 2026/27 or cup matches) do not require re-saving pages.

Re-ingest:

```bash
npm run glpm:ingest-statz -- --dir ~/Downloads/PL2526SeasonStats
```

`pl-team-form-parsed.json` includes every extracted match. Only 2025/26 Premier League rows (`season_name` `25/26`, competition id 8) are written to `glpm_match_team_stats` (`corners`, `yellow_cards`, `red_cards`, `fouls`). Existing shots / tackles / xG columns are left unchanged.

Saved Statz pages currently use `limit=10` (not last 30). Missing 26/27 club pages are listed in the JSON as `missingClubPages`.
