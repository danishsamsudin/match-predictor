# GLPM Handicap Betting Playbook

Operator handbook for staking with the handicap-focused GLPM stack (Asian Handicap, European Handicap, Double Chance, 1X2 Home/Draw).

*Last updated: October 2026*

---

## 1. What the system optimizes for now

- One Dixon–Coles **score matrix** produces 1X2, AH, EH, and DC.
- Score-grid calibration is **margin-first** (margin buckets + AH ±0.5/±1.5 + EH −1/+1), not Goal Range / O/U chasing.
- Published probabilities go through **1X2 temperature**, **per-line logistic stacks** (AH/EH/DC), then **book fair shrink + confidence hist shrink** before Kelly.
- Value Action is still confidence + Kelly, with an explicit **Prefer / Haircut / Block** gate.

Do **not** stake from raw model−Toto gaps or the old spreadsheet OVR score.

---

## 2. Pre-bet checklist (in order)

1. Is the market in the **Prefer** list (below)?
2. Is UI Action **Bet** (not Watch / Pass)?
3. League: EPL / Eredivisie / Serie A are fine; Championship / Bundesliga only if Action stayed Bet after the haircut (needs **Strong** history).
4. Side: prefer **home / 1X**; treat away covers as Watch unless Strong.
5. Sanity: if raw model edge is ≫ 20pp vs the book on AH/EH, trust shrink + history - do not override upward with intuition.
6. Live intuition: use to **veto** (injuries, weather, team news), not to invent Unders or Goal Range tickets.

---

## 3. Prefer / Haircut / Block

### Prefer (normal Bet path when Kelly clears)

- European Handicap −1 / +1 **home** or **draw**
- Asian Handicap **Home** −0.5, +0.5, +1.5
- Double Chance **1X**
- 1X2 **Home** or **Draw**

### Haircut (Bet only with Strong history + Kelly)

- Championship and Bundesliga (all sides)
- AH Away ±0.5
- Double Chance **X2**
- 1X2 **Away**

### Block (always Pass)

- Goal Range (match / team bands)
- Team Total Under 0.5
- Match Under 1.5

---

## 4. What good bets look like

- EH home or +handicap home with Strong/Moderate history and Kelly stake &gt; 0
- AH Home +0.5 / +1.5 when hist edge clears Kelly
- DC 1X when calibrated model and book disagree modestly
- 1X2 Home or Draw at non-extreme odds after temperature

---

## 5. What to skip even if Edge looks large

- Goal Range (especially 0-1 and 6+)
- Match Under 1.5 / Team Under 0.5 in this high-scoring 26/27 environment
- Naked Away Win / DC X2 / AH Away ±0.5 without Strong history
- Huge OVR/EV with low Safety (longshot hunting from the old sheet)
- High Safety shorts where Kelly is ~0 after vig (favorites with no edge)

---

## 6. Weekly review ritual

After each game week:

1. Hit rate + unit ROI by market family and by home vs away.
2. Watch margin Brier and AH ±0.5 Brier per league; if away gap widens, raise the haircut or re-run `glpm:calibrate-confidence`.
3. Do not re-expand Goal Range into the bet list until margin metrics are healthy for 4+ GWs.
4. Re-run after enough new locked evals:

```bash
npm run glpm:evaluate-markets
npm run glpm:calibrate-market-models
npm run glpm:calibrate-confidence
npm run glpm:calibrate-sharp-shrink
# Weekly / when λ drift suspected:
npm run glpm:calibrate-score-grids-all
```

Then refresh upcoming predictions for all five leagues.

---

## 7. Old spreadsheet columns → new UI

| Spreadsheet | Use now |
|---|---|
| Model Prob | Raw diagnostic only |
| Calibrated / hist probability | What Kelly uses (`pUsed`) |
| Edge / EV | Hist or book-shrunk edge only |
| Decision Pass / Bet / Strong Bet | Pass / Watch / Bet |
| OVR Score | Deprecated for staking |
| Safety Score | Rough model %; prefer confidence tier + band hit rate |

Do **not** train or settle from the exported Excel Match Outcomes sheet (known duplicate GW blocks / typos). Use locked DB evaluations (`glpm_market_evaluations`).

---

## 8. Intuition overlay

Allowed:

- Kill a Prefer Bet when late team news breaks the margin story (key attacker out, keeper change, weather).
- Stay out of Championship/Bundesliga midweek chaos even if the UI says Watch.

Not allowed:

- Promoting a Blocked market because “this one feels dead”.
- Doubling Kelly on huge raw Edge after shrink already cut it.
