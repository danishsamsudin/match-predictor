# Nations League model: strength, win chances, and xG

How the Nations League hub (`nl-graham-v1.1`) turns team data into **strength**, **expected goals**, and **win / draw / lose percentages**.

Predictions run through `runNlGrahamPredict` → shared Graham engine `resolveGrahamExpectedGoals` → Dixon-Coles score grid → tempered 1X2 probabilities.

```
Form (NL-weighted) + FIFA seed + talent
  → ΔS (capped strength gap)
  → baseline λ, μ = μ₀ · exp(±c · ΔS)
  → adjustments (set piece, momentum, finishing, FIFA pull, HA, motivation)
  → score matrix → tempered P(home / draw / away)
```

---

## 1. Strength of teams (ΔS)

Strength is not a single public rating per team on the hub. Internally it is a **home-minus-away gap** called **ΔS**, built from several rating differences and capped at ±220.

### Components

| Component | What it measures | How it is built |
|-----------|------------------|-----------------|
| **xG-Elo** | Long-run attacking edge from match xG (or goals if xG missing) | Starts from FIFA rank: `1500 − (rank − 1) × 8`. Updated chronologically: `Δ = K · ((homeXg − awayXg) − expectedDiff)`, with `K = 0.32 × competition tier`. |
| **Talent** | Squad quality in € | `talentRating = ln(squadValueEur / medianNlSquadValue)` from Transfermarkt ± Scoutlyst. |
| **WCTR** | Competitive international Elo | Same Elo machinery as xG-Elo, but friendlies get `K = 0`. Starts at 1500. `K = 0.55 × tournament weight` (Nations League ≈ 1.1–1.25). |
| **Recent xG form** | Short-term attack / defense rates | Shrinkage-weighted xGF/xGA → attack & defense multipliers → `recentForm = μ₀ × attack × oppDefense`. |
| **FIFA points** | Ranking points gap | Available as a ΔS input, but **weight is 0** for NL. FIFA still seeds xG-Elo and can pull xG later if the gap is large. |

Optional Opta / process feature deltas can add to ΔS when calibration coefficients are set.

### Formula

```
ΔxgElo      = homeXgElo − awayXgElo
Δtalent     = homeTalentRating − awayTalentRating
Δtournament = homeWCTR − awayWCTR
ΔrecentForm = recentFormHome − recentFormAway
Δfifa       = homeFifaPts − awayFifaPts

rawΔS =
    0.42 · ΔxgElo
  + 0.14 · (Δtalent · 400)
  + 0.16 · Δtournament
  + 0.20 · (ΔrecentForm · 100)
  + 0 · Δfifa
  + optaDelta + processDelta

ΔS = clamp(rawΔS, −220, +220)
```

Default ΔS weights (`NL_GRAHAM_DELTA_WEIGHTS`): xG-Elo **0.42**, talent **0.14**, WCTR **0.16**, recent form **0.20**, FIFA **0**, momentum slot **0.08**.

Notes:

- Momentum’s 8% weight is reserved in normalization but **not added into `rawΔS`**. Momentum is applied later as a multiplicative shock on xG.
- Inside a congested NL window (matches within ~21 days), talent weight decays: `1 − 0.04 · min(n, 4)`, floor **0.4**, as in-competition matches arrive.
- Form samples are reweighted for NL: competition tier × time decay × cycle. Nations League matches get tier ≈ **1.15** (finals **1.2**); friendlies **0.32**. Prior cycles: current **1.0**, 2024/25 **0.55**, 2022/23 **0.30**, older NL **0.15**. Time decay: `e^(−0.00048 · days)`.

Positive ΔS means the home side is stronger on the composite index.

---

## 2. Expected goals (xG) for each team

Baseline expected goals come directly from ΔS and a competition base rate **μ₀**.

### Baseline

```
homeXg₀ = clamp( μ₀ · exp(+c · ΔS) )
awayXg₀ = clamp( μ₀ · exp(−c · ΔS) )
```

| Constant | NL value | Role |
|----------|----------|------|
| μ₀ (`NL_GRAHAM_MU_XG`) | **1.28** | Typical goals per team at equal strength (slightly above WC’s 1.25 for true home/away internationals) |
| c (strength exponent) | **0.0026** | How strongly ΔS stretches the two xG values |
| Soft clamp | floor ~0.1, cap ~5 | Keeps extremes from exploding |

Example intuition: if ΔS = 0, both teams start near **1.28**. If home is stronger (ΔS > 0), home xG rises and away xG falls symmetrically in log space.

### Adjustments (in order)

After the baseline, the engine applies:

1. **Set-piece adjustment** - if calibration has set-piece rates.
2. **Momentum** - `home *= exp(γ · m)`, `away *= exp(−0.92 · γ · m)` with γ = **0.018**, `|m| ≤ 0.65`.
3. **Finishing regression** - pulls xG toward process-based expectation when in-window Opta form shows over/under-finishing.
4. **FIFA anchor pull** - if the FIFA ranking gap is large (> ~90 pts), blend toward `μ₀ · exp(±0.00305 · ΔFifa)`. Pull is halved under rotation / short rest.
5. **Underdog floor** - if `|ΔS| > 120`, the weaker side’s xG cannot fall below a soft floor.

### NL-specific multipliers (after baseline)

```
homeXg = homeXg_baseline × home_advantage × σ_home
awayXg = awayXg_baseline × σ_away
```

| Multiplier | Typical value | Meaning |
|------------|---------------|---------|
| Home advantage | **1.08** | True home venues (weather / altitude off for NL) |
| σ (motivation) | ~**1.04** promotion/relegation stakes, ~**0.94** dead rubber | From league standings scenario |
| Rotation / rest | σ reduced when rest is short | Congestion within the NL window |

In-window Opta team aggregates can also nudge attack/defense rates before ΔS is built (`loadNlInCompetitionFormNudges`).

Final `home_xg` / `away_xg` on the prediction snapshot are these adjusted values (rounded to 2 decimals in the Graham baseline step).

---

## 3. Chances to win (percentages)

Win / draw / away % are **not** a direct softmax of ΔS. They come from a full **scoreline probability grid**, then a mild temperature smooth.

### Score grid

1. Take final `homeXg` and `awayXg` as Poisson (or negative-binomial if overdispersion `K > 0`) means.
2. Apply a **Dixon-Coles** low-score correlation ρ (boosts / damps 0-0, 1-0, 0-1, 1-1). ρ depends on total xG and strength gap, plus a motivation offset, and is attenuated when the two xG values are far apart.
3. Optionally mix in a small **red-card** scenario (base ≈ 4%, scaled by discipline load).
4. Sum all home-win cells, draw cells, and away-win cells → raw `P(H)`, `P(D)`, `P(A)`.

### Temperature (softening)

Raw Poisson grids often make favorites look too strong. NL applies temperature **τ = 1.15**:

```
p'_i = p_i^τ / (p_H^τ + p_D^τ + p_A^τ)
```

With τ > 1 this **softens favorites** and lifts draw / underdog share relative to the raw grid.

Published fields:

- `home_win_pct`, `draw_pct`, `away_win_pct` (tempered)
- Also derived: predicted most-likely scoreline, O/U 2.5 %, top scorelines

Hub source tag: `graham-nl-hub`.

---

## Pre-match vs post-match

| Stage | Role |
|-------|------|
| **Pre-match** | `runNlGrahamPredict` / hub snapshot writes `nations_league_predictions` using historical form, FIFA-seeded Elo, talent, and any same-window Opta form. |
| **Post-match** (`nl:postmatch`) | Ingest Opta → recompute persisted xG-Elo / WCTR / talent → refresh hub. Updates **inputs** for the next prediction; it does not replace the Graham formulas above. |

---

## Key source files

| Piece | File |
|-------|------|
| NL entrypoint | `src/lib/nations-league/nl-predict.ts` |
| NL constants / form weights | `src/lib/nations-league/nl-graham-model-config.ts` |
| ΔS → baseline xG | `src/lib/world-cup/graham-expected-goals.ts` |
| xG-Elo | `src/lib/world-cup/graham-xg-elo.ts` |
| WCTR | `src/lib/world-cup/graham-tournament-rating.ts` |
| Talent | `src/lib/world-cup/national-squad-talent.ts` |
| Score grid / 1X2 | `src/lib/world-cup/score-grid.ts` |

---

## Quick constant cheat sheet

| Constant | Value |
|----------|-------|
| Model version | `nl-graham-v1.1` |
| Base μ₀ | 1.28 |
| Strength exponent c | 0.0026 |
| ΔS cap | ±220 |
| Home advantage | 1.08 |
| 1X2 temperature τ | 1.15 |
| xG-Elo base K | 0.32 |
| WCTR base K | 0.55 |
| Form decay φ | 0.00048 / day |
| Talent decay | 0.04 per in-window match (cap 4, floor 0.4) |
