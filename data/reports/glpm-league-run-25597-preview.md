# GLPM league run — season 25597

_Generated 2026-07-22 12:07 UTC_

## What we collected

- **Matches:** 309
- **Team-match rows:** 336
- **Real xG / proxy xG:** 0 / 336
- **PPDA proxy / Wyscout:** 336 / 0

SportMonks is the primary source. Proxies are flagged — never presented as Wyscout-quality.

## What we estimated (and why)

| Field | How we filled it |
|---|---|
| Defensive actions | Tackles + interceptions + clearances |
| PPDA (pressing proxy) | Opponent passes ÷ our defensive actions |
| xG | SportMonks Expected Goals, or shot-based proxy if missing |
| Goalkeeper saves | Team stat or summed from lineup details |

## Machine learning summary

How the fitted 0–100 ratings are spread this run. A healthy engine usually shows a clear top–bottom gap (discrimination) rather than everyone clustered near the same score.

- **Engines trained:** 7 / 7
- **Learned variables tracked:** 1225
- **Variables changed vs previous run:** 0
- **Team headline ratings that moved:** 0
- **First baseline run:** no

| Engine | N | Mean | Std | Min | Max | Spread | Top | Bottom |
|---|--:|---:|---:|---:|---:|---:|---|---|
| Attack | 18 | 66.5 | 13.3 | 39.4 | 86.6 | 47.2 | Heracles Almelo (86.6) | Fortuna Sittard (39.4) |
| Defence | 18 | 60.3 | 17.2 | 27.8 | 93.5 | 65.7 | FC Volendam (93.5) | Go Ahead Eagles (27.8) |
| Goalkeeper (starters) | 10 | 69.7 | 13.7 | 44.4 | 84.7 | 40.3 | Etienne Vaessen (84.7) | Ronald Koeman Jr. (44.4) |
| Build-Up | 18 | 62.2 | 15.2 | 36.2 | 88.0 | 51.8 | FC Twente (88.0) | FC Groningen (36.2) |
| Possession | 18 | 61.2 | 11.2 | 42.5 | 78.1 | 35.6 | AZ (78.1) | FC Groningen (42.5) |
| Pressing | 18 | 64.4 | 13.0 | 41.0 | 88.0 | 47.0 | NEC Nijmegen (88.0) | PEC Zwolle (41.0) |
| Finishing | 18 | 63.4 | 14.7 | 40.7 | 88.8 | 48.1 | FC Volendam (88.8) | Fortuna Sittard (40.7) |

_Reading tip:_ **Spread** = max − min. Very small spreads mean the engine barely separates clubs; large spreads with sensible Top/Bottom names are easier to trust.

## What the model means as a whole

1. **Data** — SportMonks match stats (proxies where needed).
2. **Features** — per-match rates (shots, xG, PPDA, progression, …).
3. **Seven engines** — context adjust → components → domains → primary → 0–100 calibration.
4. **Prediction** — rating vector + locked interaction weights (ATK–DEF 40%, FIN–GK 25%, BU–PRS 20%, POSS–PRS 15%) → Dixon–Coles markets.

**This run:** Learned weights effectively unchanged. Ratings may still nudge as latest matches enter the training set.

## Training results (seven engines)

Full league table of assembled ratings (0–100). **Starter GK** is the highest-minutes lineup goalkeeper (SportMonks position).

- `Attack` 18 teams (`attack_v1`) · `Defence` 18 teams (`defence_v1`) · `Goalkeeper` 58 keepers (`gk_v1`) · `Build-Up` 18 teams (`build_up_v1`) · `Possession` 18 teams (`possession_v1`) · `Pressing` 18 teams (`pressing_v1`) · `Finishing` 18 teams (`finishing_v1`)

### League rating table

| # | Team | ATK | DEF | GK | BU | POSS | PRS | FIN | Avg | Starter GK | GK rtg |
|--:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|
| 1 | FC Volendam | 76.8 | 93.5 | 74.6 | 57.1 | 52.1 | 71.1 | 88.8 | 73.4 | Kayne van Oevelen | 74.8 |
| 2 | NEC Nijmegen | 78.6 | 83.5 | 69.2 | 50.8 | 74.6 | 88.0 | 44.5 | 69.9 | Gonzalo Crettaz | 68.7 |
| 3 | AZ | 70.9 | 80.8 | 57.0 | 82.8 | 78.1 | 53.3 | 63.3 | 69.4 | Rome Jayden Owusu-Oduro | 82.2 |
| 4 | Feyenoord | 77.6 | 78.0 | 60.4 | 56.4 | 70.1 | 44.0 | 84.7 | 67.3 | Timon Wellenreuther | — |
| 5 | Telstar | 80.4 | 50.8 | 83.7 | 46.9 | 68.2 | 78.4 | 59.8 | 66.9 | Ronald Koeman Jr. | 44.4 |
| 6 | Heracles Almelo | 86.6 | 40.4 | 73.7 | 49.9 | 59.7 | 75.2 | 74.3 | 65.7 | Timo Jansink | — |
| 7 | Sparta Rotterdam | 45.4 | 54.6 | 63.8 | 75.5 | 60.7 | 76.9 | 80.9 | 65.4 | Joël Drommel | 63.8 |
| 8 | Ajax | 63.4 | 71.6 | 46.0 | 60.0 | 76.9 | 71.4 | 56.8 | 63.7 | Vitezslav Jaros | 45.8 |
| 9 | FC Twente | 52.1 | 55.1 | 79.0 | 88.0 | 51.2 | 61.1 | 59.0 | 63.6 | Lars Unnerstall | 79.2 |
| 10 | SC Heerenveen | 70.9 | 63.3 | 64.6 | 43.4 | 76.0 | 75.9 | 43.4 | 62.5 | Bernt Klaverboer | — |
| 11 | FC Utrecht | 69.0 | 45.7 | 64.1 | 79.3 | 48.1 | 56.8 | 71.6 | 62.1 | Vasilios Barkas | 81.6 |
| 12 | PSV | 70.9 | 47.0 | 52.1 | 87.3 | 72.3 | 51.6 | 52.0 | 61.9 | Matej Kovar | — |
| 13 | Excelsior | 60.1 | 84.2 | 72.5 | 69.1 | 49.7 | 51.1 | 45.1 | 61.7 | Stijn van Gassel | 71.5 |
| 14 | FC Groningen | 82.8 | 54.5 | 70.8 | 36.2 | 42.5 | 73.0 | 67.4 | 61.0 | Etienne Vaessen | 84.7 |
| 15 | NAC Breda | 66.8 | 56.3 | 46.0 | 58.2 | 62.6 | 65.1 | 64.4 | 59.9 | Daniel Bielica | — |
| 16 | PEC Zwolle | 46.8 | 48.9 | 66.3 | 68.0 | 55.3 | 41.0 | 84.9 | 58.7 | Tom de Graaff | — |
| 17 | Go Ahead Eagles | 58.0 | 27.8 | 56.8 | 63.5 | 53.6 | 72.3 | 59.4 | 55.9 | Jari De Busser | — |
| 18 | Fortuna Sittard | 39.4 | 50.3 | 53.5 | 46.4 | 49.2 | 52.9 | 40.7 | 47.5 | Mattijs Branderhorst | — |

### Starting XI goalkeepers (by season minutes)

| # | Team | Goalkeeper | Player rating | Season mins |
|--:|---|---|---:|---:|
| 1 | FC Groningen | Etienne Vaessen | 84.7 | 2604 |
| 2 | AZ | Rome Jayden Owusu-Oduro | 82.2 | 2052 |
| 3 | FC Utrecht | Vasilios Barkas | 81.6 | 3136 |
| 4 | FC Twente | Lars Unnerstall | 79.2 | 2790 |
| 5 | FC Volendam | Kayne van Oevelen | 74.8 | 2851 |
| 6 | Excelsior | Stijn van Gassel | 71.5 | 2820 |
| 7 | NEC Nijmegen | Gonzalo Crettaz | 68.7 | 2790 |
| 8 | Sparta Rotterdam | Joël Drommel | 63.8 | 3060 |
| 9 | Ajax | Vitezslav Jaros | 45.8 | 1710 |
| 10 | Telstar | Ronald Koeman Jr. | 44.4 | 2959 |
| 11 | Go Ahead Eagles | Jari De Busser | — | 3060 |
| 12 | Feyenoord | Timon Wellenreuther | — | 2970 |
| 13 | NAC Breda | Daniel Bielica | — | 2970 |
| 14 | PSV | Matej Kovar | — | 2790 |
| 15 | PEC Zwolle | Tom de Graaff | — | 2790 |
| 16 | SC Heerenveen | Bernt Klaverboer | — | 2700 |
| 17 | Fortuna Sittard | Mattijs Branderhorst | — | 2160 |
| 18 | Heracles Almelo | Timo Jansink | — | 1350 |

_Note: 8 starting keepers have no player-level GK rating yet (team **GK** column above still comes from the assembled vector)._

## Variables that changed (with meaning)

_No learned weights moved materially since the previous training snapshot._

## Team rating outputs that changed

_Headline team ratings unchanged vs the previous training snapshot._

## What is still approximate until Wyscout

- True pressing intensity (zone-aware PPDA from events)
- Detailed goalkeeper involvement outside the box
- Shot placement coordinates for finishing refinement

Wyscout code remains in the repo. To reactivate: set `WYSCOUT_USERNAME` / `WYSCOUT_PASSWORD`, map entities in `glpm_provider_entity_map`, enable `GLPM_WYSCOUT_ENRICH=1`, then run `npm run glpm:wy-enrich -- <matchSmId>` after SportMonks ingest.

## Sample match prediction

We picked **Heracles Almelo** vs **FC Groningen** as a sample fixture.


These numbers come from the seven skill ratings plus home advantage — estimates, not guarantees.

## What changed this run

_Previous report: `glpm-league-run-25597-2026-07-22T11-43-02.md`. Weight and rating diffs are in the sections below._

## Model variable coverage

Counts of tracked learned weights (calibrator percentile maps omitted). Full coefficient dumps stay in artifacts / introspection JSON — this report keeps the readable summary.

_Omitted 414 calibrator percentile rows._

| Engine | Layer | Variables |
|---|---|--:|
| attack | component | 21 |
| attack | context_adjuster | 85 |
| attack | domain | 6 |
| attack | primary | 3 |
| build_up | component | 19 |
| build_up | context_adjuster | 76 |
| build_up | domain | 6 |
| build_up | primary | 3 |
| defence | component | 20 |
| defence | context_adjuster | 81 |
| defence | domain | 7 |
| defence | primary | 3 |
| finishing | component | 26 |
| finishing | context_adjuster | 105 |
| finishing | domain | 6 |
| finishing | primary | 3 |
| goalkeeper | component | 25 |
| goalkeeper | context_adjuster | 101 |
| goalkeeper | domain | 5 |
| goalkeeper | primary | 2 |
| possession | component | 18 |
| possession | context_adjuster | 72 |
| possession | domain | 6 |
| possession | primary | 3 |
| pressing | component | 18 |
| pressing | context_adjuster | 72 |
| pressing | domain | 6 |
| pressing | primary | 3 |
| xg_engine | prediction | 10 |

**Total tracked (excl. calibrators):** 811
