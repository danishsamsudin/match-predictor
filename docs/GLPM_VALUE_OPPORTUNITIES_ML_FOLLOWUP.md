# GLPM Value Opportunities: reliability calibrator follow-up

After per-league empirical confidence layers ship, the first machine-learning upgrade should replace the fixed probability bins + `KELLY_SHRINK_PRIOR = 20` blend in `shrunkProbability` with a **monotonic reliability calibrator**.

## Why

The confidence layer already learns hit rates from locked evaluations. What remains heuristic is:

1. Coarse bands (`0-40`, `40-50`, …) that force 71% and 78% into the same bucket.
2. The shrink weight `n / (n + 20)` that blends history with the raw model %.

Those knobs do not adapt per league or market family.

## How it would work

1. **Training rows** from `glpm_market_evaluations`: `(league_sm_id, marketKey, predictedProb, hit, match_date)`.
2. **Per league** (and optionally per market family such as `btts`, `goals_over_under`, `asian_handicap`, `shots_ou`), fit:
   - **Isotonic regression** (preferred: preserves ranking, no parametric form), or
   - **Platt scaling** (logistic map from model logit → calibrated probability) when sample is thinner.
3. At Value Opportunities row time, set `pUsed = calibrator(modelProb)` instead of bin lookup + shrink. Keep a Wilson or sample-size floor when `n` is tiny so early-season rows stay cautious.
4. **Deploy gate** (same spirit as `nl-ml-train.ts`): compare holdout Brier / log-loss on the newest ~30% of matches; write a new `glpm_calibration_config` row only if recent games do not get worse.
5. UI columns stay the same (Confidence / Hist edge / Stake / Action). Confidence tiers can still be derived from calibrated `pUsed` vs book, or from residual bin diagnostics for display.

## What not to ML first

- Pass / Watch / Bet tree (`value-action.ts`) - keep fixed.
- Tier `minN` / Wilson thresholds - leave until the calibrator is live.
- Main GLPM xG engine weights - separate from Value Opportunities.

## Shots satellite note

Shot markets already shrink toward league means (`shot-markets.ts`, `satellite_ml_v1`). After shot evals accumulate, a small per-league Poisson-mean or logistic head can nudge shot λ before O/U probs are built, using the same holdout deploy gate.
