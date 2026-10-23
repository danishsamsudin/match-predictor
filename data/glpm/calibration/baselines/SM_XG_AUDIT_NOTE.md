# SportMonks xG audit (Championship + Eredivisie)

## Resolution (2026-10-23)

**xG Basic is active.** Earlier FAIL was an ingest-path bug (`include=xGFixture` empty), not a missing add-on.

| Path | Result |
| --- | --- |
| Fixture `include=xGFixture` | Usually **empty** even with xG Basic |
| `GET /football/expected/fixtures` | Returns type **5304** after FT |
| `filters=fixtureIds:…` | **Unreliable** - ingest scans the global feed |

**Ingest:** merges `/expected/fixtures` into `xGFixture` (daily sync + batch). Backfill: `npm run glpm:backfill-sm-expected-xg`.

**Phase 2 overlays (plan):** when current-season provider fill ≥70%, apply SM-xG season A/D/FR percentiles (not GF/GA):

```bash
npm run glpm:import-sm-xg-season-ratings -- --all
```

Night refresh / league-run call `reapplySeasonRatingOverlay`, which prefers SM-xG for Champ/Ere **2026/27** and falls back to standings GF/GA if fill is low. Prior season (25/26) stays on standings (0% provider fill in the expected feed).

Same-day FT may lack xG until SportMonks finishes processing.

## Ops

1. `npm run glpm:probe-sm-xg`
2. `npm run glpm:backfill-sm-expected-xg`
3. `npm run glpm:audit-sm-xg`
4. `npm run glpm:import-sm-xg-season-ratings -- --all`
5. Confirm `SPORTMONKS_API_TOKEN` has **xG Basic**
