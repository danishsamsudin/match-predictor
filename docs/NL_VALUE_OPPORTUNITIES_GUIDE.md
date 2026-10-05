# Nations League Value Opportunities: Confidence, Stake, and Action

A plain-language guide to the new columns on the Nations League hub **Value opportunities** table.

You do not need to know the model internals to use this. The short version:

1. The model picks a percentage chance for a market (for example “both teams to score: yes”).
2. We look up how often **similar** past picks actually won.
3. We size a stake only when that history, plus today’s book price, still looks like a real edge.
4. We label the row **Pass**, **Watch**, or **Bet** from those same signals.

---

## What this platform is doing

Match Predictor builds pre-match chances for UEFA Nations League fixtures. Those chances come from a team-strength model (Graham): recent form, talent, competitive ratings, and related inputs turn into expected goals and then into market percentages (1X2, over/under, BTTS, double chance, and more).

**Value opportunities** is the panel where you type a bookmaker’s decimal odds next to those model prices. The goal is not “the model said 65%, so bet.” The goal is: **given how this kind of pick has behaved in finished Nations League games we already scored, does this book price still look worth acting on?**

That is what **Confidence**, **Stake**, and **Action** add.

---

## The three new signals

| Column | What you see | What it means in practice |
|--------|----------------|---------------------------|
| **Confidence** | Strong / Moderate / Weak / None, plus a hit rate and sample size | How trustworthy this model-% band has been historically for this market |
| **Stake** | A % of bankroll and units (or `0u`) | Suggested size if you treat the historical hit rate as the honest chance |
| **Action** | Pass / Watch / Bet | A single shared recommendation from confidence + edge + stake |

Edge in this panel is measured mainly against **history**, not only against the raw model %. If the model is optimistic and history is cooler, stake and action follow the cooler number.

---

## Where the data comes from

After each finished Nations League match, the post-match pipeline:

1. Locks (or reuses) the **pre-kickoff** predicted percentages.
2. Records whether each market outcome **hit** or missed.
3. Rebuilds a **confidence layer**: for each market, “when we predicted about X%, how often did it actually win?”

So confidence is not a gut feeling and not the model saying “I am sure.” It is a **track record** of locked predictions versus real results, refreshed when we run Nations League post-match learning.

Important details:

- Rows are stored per market type (for example home win, BTTS yes, over 2.5).
- We only learn from finished matches we have evaluated.
- Early in a cycle, many bands will show **None** because there is not enough sample yet. That is intentional.

---

## Confidence: how it is calculated

### Step 1 - Group past picks into probability bands

Every past locked prediction has a **model probability** (a number between 0 and 1, shown as a %). We sort those into bands:

| Band label | Model probability range |
|------------|-------------------------|
| 0-40 | 0% up to (not including) 40% |
| 40-50 | 40% to 50% |
| 50-60 | 50% to 60% |
| 60-70 | 60% to 70% |
| 70-80 | 70% to 80% |
| 80-90 | 80% to 90% |
| 90-100 | 90% to 100% |

Example: if today’s BTTS yes price is 73%, we look at the **70-80** band for BTTS yes.

### Step 2 - Measure how often that band hit

For each band we compute:

- **n** - sample size: how many past locked picks fell in this band.
- **hits** - how many of those picks actually won.
- **hit rate** - `hits / n`. This is the historical win rate for that band.
- **average prediction** - the average model % inside the band.
- **gap** - `average prediction − hit rate`. A large positive gap means the model was systematically more optimistic than reality in that band.
- **Wilson lower bound** - a cautious lower estimate of the true hit rate. Small samples get pulled down; this stops “8 out of 10” looking as solid as “80 out of 100.”

### Step 3 - Assign a tier to the band

Tiers are guardrails on that history:

| Tier | Plain meaning | Rough requirements |
|------|----------------|--------------------|
| **Strong** | History backs this band well enough for a decision-ready signal | Enough games (**n ≥ 20**), cautious hit-rate floor high (**Wilson lower ≥ 65%**), and the model was not badly overconfident (**gap ≤ 12%**) |
| **Moderate** | Useful history - treat as a guardrail, not a guarantee | **n ≥ 12**, Wilson lower **≥ 55%**, gap **≤ 18%** |
| **Weak** | Enough history to size a *small* stake from the hit rate, even if the model % looks too high | **n ≥ 8** (hit rate can be low; stake logic still refuses negative edge) |
| **None** | Not enough reliable history in this band | Stake stays at **0** |

### Step 4 - Extra caution for Strong

We keep a recent **holdout** slice of matches (about the newest 30%) as a check. A band only stays **Strong** if recent games still look solid (enough holdout cases and a high enough cautious hit rate). If recent form of that band is soft, Strong is demoted.

Floors (the lowest % where Strong / Moderate / Weak start) also move gradually when the layer is rebuilt, so one noisy weekend does not flip the UI overnight.

### What the chip on the row is telling you

- **Hit 68% · 24 games** means: in 24 past locked picks in this same market and similar model-%, the outcome won about 68% of the time.
- Stake sizing uses that history (after a shrink step below), **not** the raw model % alone.
- If history says ~68% but the book is priced like a 75% chance (shorter odds), history says there is **no edge**, even if the model still prints a higher %.

---

## Stake: how size is chosen

Stake answers: **if I trust history more than hype, how much of my bankroll makes sense at this book price?**

### Inputs

- **Model probability** - today’s model % for the row.
- **Book decimal odds** - the price you typed (for example 2.10).
- **Confidence lookup** - tier, hit rate, sample size **n**, and Wilson lower bound for this band.
- **Bankroll units** - defaults to 100 units if you leave the field alone. Stake % × bankroll = suggested units.

### Step 1 - Build a cautious probability (`pUsed`)

We do **not** Kelly straight off the model %.

1. Blend the historical hit rate with the model % using sample size:
   - Weight on history = `n / (n + 20)`.
   - Weight on the model = `1 − that`.
   - So with **n = 20**, history and model split 50/50. With tiny **n**, we lean more on the model; with large **n**, we lean more on history.
2. For **Strong** and **Moderate**, we then **cap** that blend at the Wilson lower bound (we refuse to bet as if the chance is higher than the cautious floor).
3. For **Weak**, we use the blend without that Wilson cap (but Kelly still needs a real edge).

Call this blended, capped number **pUsed** - the probability we actually size against.

### Step 2 - Check edge versus the book

- Book implied chance ≈ `1 / decimal odds`.
- **Edge** ≈ `pUsed − book implied chance`.
- We also require a minimum edge of about **1 percentage point** before suggesting a stake.

If there is no edge (or Kelly would be zero/negative), stake is **0u**. The UI may show **Need ≥ X.XX**: the shortest decimal odds where history would still clear that bar.

### Step 3 - Fractional Kelly, then hard caps

Full Kelly is a classic bankroll formula for a binary bet:

```
full Kelly fraction =
  ( (odds − 1) × pUsed − (1 − pUsed) ) / (odds − 1)
```

In words: how much of bankroll to risk if **pUsed** is the true chance and you want long-run growth. Full Kelly is aggressive, so we take only a fraction of it:

| Confidence tier | Fraction of full Kelly we use |
|-----------------|-------------------------------|
| Strong | 25% of full Kelly |
| Moderate | 12.5% of full Kelly |
| Weak | 5% of full Kelly |
| None | 0 (no stake) |

Then we **cap** the suggestion at **2.5% of bankroll**, no matter how juicy the price looks.

Displayed stake:

- **%** = that capped fraction of bankroll.
- **units** = `% × bankroll` (with bankroll defaulting to 100, so `1.5u` means 1.5% of a 100-unit roll).

### Why stake can be zero even when the model looks good

- Confidence is **None** (not enough history in this band).
- History clears a small edge but not the Kelly / min-edge bar.
- You have not entered book odds yet.
- Book odds are not above 1.00.

---

## Action: Pass, Watch, or Bet

Action is one shared rule for every market. Markets already differ through their own confidence history; we do not invent a separate BTTS-only or 1X2-only action formula.

| Action | Meaning |
|--------|---------|
| **Pass** | Skip this price |
| **Watch** | Interesting - do not force |
| **Bet** | History and price align enough to act |

### Decision order

1. **No book odds** → **Pass** (“enter book odds before deciding”).
2. **Confidence None** (or missing) → **Pass** (not enough locked history in this model-% band).
3. **Kelly stake > 0** and confidence is **Strong** or **Moderate** → **Bet**.
4. **Kelly stake > 0** but confidence is only **Weak** → **Watch** (optional small size; prefer a better price or a stronger band if unsure).
5. History edge is slightly positive but below the Kelly bar → **Watch** (wait for a longer book).
6. Model edge is at least about **+3%** but history does **not** agree → **Watch** (model likes it; history does not yet - chase price or wait for more sample).
7. Otherwise → **Pass**, often with a “need book ≥ …” hint from the stake logic.

So **Bet** is deliberately narrow: solid-enough history **and** a positive Kelly stake at the price you typed. **Watch** is the middle ground for weak history, thin historical edge, or model-only optimism.

---

## Assumptions (what we are taking as true)

1. **Locked pre-match percentages are the right thing to score.** We learn from what the model said before kickoff, not from after-the-fact hindsight.
2. **Past Nations League evaluations are relevant to upcoming ones** in the same market family. Different competitions are not mixed into this layer.
3. **Probability bands are a fair way to group “similar” picks.** 71% and 78% are treated as the same 70-80 band; that is a compromise between detail and sample size.
4. **A cautious hit-rate floor (Wilson) is safer than the raw hit rate** when deciding Strong / Moderate and when capping Strong/Moderate stake probabilities.
5. **Fractional Kelly with a 2.5% bankroll cap** is a sizing heuristic, not financial advice and not a guarantee of profit.
6. **Exclusive outcomes on the same match should not be stacked** as if they were independent (for example do not add “home win” and “draw” Kelly stakes together).
7. **Confidence will improve as more finished matches are evaluated.** Early Weak/None labels are expected, not a bug.
8. **Action thresholds are fixed policy**, while adaptation over time comes from rebuilding confidence / hit rates on post-match - not from rewriting a different rule per market every week.

---

## Reasoning: why this exists

Raw model edge alone is easy to misuse. A model can print “72%” when history in that band only hits 55%. Without a track record, every optimistic price looks like value.

The confidence layer answers a simpler question first:

> When we have said something like this before, how often were we right?

Stake then answers:

> If we treat that track record (cautiously) as the chance, is the book still paying enough - and if so, how much of bankroll is sane?

Action packages those answers into **Pass / Watch / Bet** so the table is usable without doing the Kelly math by hand.

Together they push the product from “model vs book” toward “**history-checked** model vs book.”

---

## Quick worked example

Suppose:

- Market: Both teams to score - Yes  
- Model %: **73%** (fair odds about 1.37)  
- Book you typed: **1.90** (book implies about 53%)  
- Confidence chip: **Moderate · Hit 64% · 18 games**

What happens behind the scenes:

1. Band is **70-80**. History hit rate 64% with n = 18 → Moderate.
2. **pUsed** blends 64% history with 73% model (weight on history ≈ 18/(18+20) ≈ 47%), then caps at the Wilson lower bound for Moderate/Strong.
3. If that **pUsed** still beats the book’s ~53% by at least ~1 point and Kelly is positive, you get a small fractional stake (Moderate uses 12.5% of full Kelly, capped at 2.5% of bankroll).
4. Action becomes **Bet** because Moderate + positive Kelly stake.

If instead the book was **1.40** (implied ~71%), history might say there is little or no edge even though the model still looks “hot.” Stake goes to **0u**, often with **Need ≥ …**, and Action becomes **Pass** or **Watch**.

---

## How this stays up to date

When Nations League post-match learning runs (`nl:postmatch`), it scores finished markets and rebuilds the confidence layer (also available alone as `nl:calibrate-confidence`). The hub then reads that saved layer for Value opportunities.

No confidence layer yet → the older model-edge-only view may still show, but Confidence / Stake / Action need the learned history to appear.

---

## What this is not

- Not a tipster lock or a promise of profit.
- Not live trading advice; prices you type are yours to refresh.
- Not a replacement for bankroll discipline; the 2.5% cap is a soft product guardrail.
- Not proof that every Strong label will hit; Strong means **past similar bands cleared strict filters**, including a recent-holdout check.

If you want the underlying team-strength math (ΔS, xG, win probabilities), see [NL_GRAHAM_MODEL_CALCULATIONS.md](./NL_GRAHAM_MODEL_CALCULATIONS.md).
