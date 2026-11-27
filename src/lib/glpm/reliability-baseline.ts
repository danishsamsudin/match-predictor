/**
 * Aggregate glpm_market_evaluations into per-league / per-market reliability stats.
 */

export type ReliabilityEvalRow = {
  league_sm_id: number;
  market_id: string;
  market_key: string;
  predicted: Record<string, unknown> | null;
  actual: Record<string, unknown> | null;
  loss_value: number | null;
  match_date: string | null;
  match_sm_id?: number;
};

export type ReliabilityBucket = {
  n: number;
  hits: number;
  hitRate: number;
  avgPred: number;
  calibrationGap: number;
  avgBrier: number;
  avgLogLoss: number | null;
};

export type MarketReliability = ReliabilityBucket & {
  marketId: string;
  marketKey: string;
};

export type LeagueReliability = {
  leagueSmId: number;
  nRows: number;
  markets: MarketReliability[];
  byFamily: Record<string, ReliabilityBucket>;
};

export type ReliabilityBaselineReport = {
  computedAt: string;
  nRows: number;
  leagues: LeagueReliability[];
  overall: ReliabilityBucket;
};

function asProb(predicted: Record<string, unknown> | null): number | null {
  if (!predicted) return null;
  const raw =
    predicted.prob ?? predicted.yesPct ?? predicted.overPct ?? predicted.homePct;
  const n = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isFinite(n)) return null;
  // Stored as 0-1 or 0-100
  return n > 1.0001 ? n / 100 : Math.max(0, Math.min(1, n));
}

function asHit(actual: Record<string, unknown> | null): boolean | null {
  if (!actual) return null;
  if (typeof actual.hit === "boolean") return actual.hit;
  if (typeof actual.yes === "boolean") return actual.yes;
  if (typeof actual.over === "boolean") return actual.over;
  return null;
}

function logLoss(p: number, hit: boolean): number {
  const eps = 1e-6;
  const q = Math.min(1 - eps, Math.max(eps, p));
  return hit ? -Math.log(q) : -Math.log(1 - q);
}

function marketFamily(marketId: string): string {
  const id = marketId.toLowerCase();
  if (id.includes("btts")) return "btts";
  if (id.includes("over_under") || id.includes("ou_") || id === "goals_ou")
    return "ou";
  if (id.includes("asian") || id.includes("ah_")) return "ah";
  if (id.includes("european") || id.includes("eh_")) return "eh";
  if (id.includes("team_total") || id.includes("tt_")) return "team_total";
  if (id.includes("double") || id.includes("dc_")) return "double_chance";
  if (
    id.includes("1x2") ||
    id === "match_result" ||
    id === "win_probability"
  )
    return "1x2";
  return "other";
}

/** Synthetic market_key for argmax-selection hit rates (1X2 / DC). */
export const TOP_PICK_MARKET_KEY = "top_pick";

function numField(
  obj: Record<string, unknown> | null,
  ...keys: string[]
): number | null {
  if (!obj) return null;
  for (const key of keys) {
    const raw = obj[key];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n)) return n > 1.0001 ? n / 100 : n;
  }
  return null;
}

/**
 * 1X2 top pick: choose home/draw/away with highest model prob; hit if it matches outcome.
 */
function oneXTwoTopPick(
  predicted: Record<string, unknown> | null,
  actual: Record<string, unknown> | null
): { pred: number; hit: boolean } | null {
  const home = numField(predicted, "home", "homePct");
  const draw = numField(predicted, "draw", "drawPct");
  const away = numField(predicted, "away", "awayPct");
  if (home == null || draw == null || away == null) return null;
  const outcomeRaw = actual?.outcome;
  const outcome =
    typeof outcomeRaw === "string" ? outcomeRaw.toLowerCase() : null;
  if (outcome !== "home" && outcome !== "draw" && outcome !== "away") return null;

  let pick: "home" | "draw" | "away" = "home";
  let pred = home;
  if (draw > pred) {
    pick = "draw";
    pred = draw;
  }
  if (away > pred) {
    pick = "away";
    pred = away;
  }
  return { pred, hit: pick === outcome };
}

type DcSide = { key: string; pred: number; hit: boolean };

/**
 * DC top pick: among 1x / 12 / x2 for one match, take the highest-prob side and its hit.
 */
function doubleChanceTopPick(sides: DcSide[]): { pred: number; hit: boolean } | null {
  if (sides.length === 0) return null;
  let best = sides[0]!;
  for (let i = 1; i < sides.length; i++) {
    const s = sides[i]!;
    if (s.pred > best.pred || (s.pred === best.pred && s.key < best.key)) {
      best = s;
    }
  }
  return { pred: best.pred, hit: best.hit };
}

function addSelection(acc: Acc, pred: number, hit: boolean, lossValue: number | null): void {
  acc.n += 1;
  if (hit) acc.hits += 1;
  acc.predSum += pred;
  const brier =
    typeof lossValue === "number" && Number.isFinite(lossValue)
      ? lossValue
      : (pred - (hit ? 1 : 0)) ** 2;
  acc.brierSum += brier;
  acc.logLossSum += logLoss(pred, hit);
  acc.logLossN += 1;
}

export function emptyBucket(): ReliabilityBucket {
  return {
    n: 0,
    hits: 0,
    hitRate: 0,
    avgPred: 0,
    calibrationGap: 0,
    avgBrier: 0,
    avgLogLoss: null,
  };
}

function finalizeBucket(
  n: number,
  hits: number,
  predSum: number,
  brierSum: number,
  logLossSum: number,
  logLossN: number
): ReliabilityBucket {
  if (n <= 0) return emptyBucket();
  const hitRate = hits / n;
  const avgPred = predSum / n;
  return {
    n,
    hits,
    hitRate,
    avgPred,
    calibrationGap: avgPred - hitRate,
    avgBrier: brierSum / n,
    avgLogLoss: logLossN > 0 ? logLossSum / logLossN : null,
  };
}

type Acc = {
  n: number;
  hits: number;
  predSum: number;
  brierSum: number;
  logLossSum: number;
  logLossN: number;
};

function newAcc(): Acc {
  return { n: 0, hits: 0, predSum: 0, brierSum: 0, logLossSum: 0, logLossN: 0 };
}

function addRow(acc: Acc, row: ReliabilityEvalRow): void {
  const p = asProb(row.predicted);
  const hit = asHit(row.actual);
  if (p == null || hit == null) return;
  acc.n += 1;
  if (hit) acc.hits += 1;
  acc.predSum += p;
  const brier =
    typeof row.loss_value === "number" && Number.isFinite(row.loss_value)
      ? row.loss_value
      : (p - (hit ? 1 : 0)) ** 2;
  acc.brierSum += brier;
  acc.logLossSum += logLoss(p, hit);
  acc.logLossN += 1;
}

export function buildReliabilityBaseline(
  rows: ReliabilityEvalRow[]
): ReliabilityBaselineReport {
  const overall = newAcc();
  const byLeague = new Map<number, Map<string, Acc>>();
  const familyByLeague = new Map<number, Map<string, Acc>>();
  /** Per-league accumulators for argmax selection metrics. */
  const oneXTwoTopByLeague = new Map<number, Acc>();
  const dcTopByLeague = new Map<number, Acc>();
  /** DC sides grouped by league + match for top-pick aggregation. */
  const dcByMatch = new Map<string, { league: number; sides: DcSide[] }>();

  for (const row of rows) {
    addRow(overall, row);
    const league = Number(row.league_sm_id);
    if (!Number.isFinite(league)) continue;
    if (!byLeague.has(league)) byLeague.set(league, new Map());
    if (!familyByLeague.has(league)) familyByLeague.set(league, new Map());
    const key = `${row.market_id}::${row.market_key}`;
    const m = byLeague.get(league)!;
    if (!m.has(key)) m.set(key, newAcc());
    addRow(m.get(key)!, row);
    const fam = marketFamily(row.market_id);
    const f = familyByLeague.get(league)!;
    if (!f.has(fam)) f.set(fam, newAcc());

    if (row.market_id === "win_probability") {
      const pick = oneXTwoTopPick(row.predicted, row.actual);
      if (pick) {
        if (!oneXTwoTopByLeague.has(league)) oneXTwoTopByLeague.set(league, newAcc());
        addSelection(oneXTwoTopByLeague.get(league)!, pick.pred, pick.hit, row.loss_value);
        // Family bucket uses selection hit (raw win_probability has no binary hit).
        addSelection(f.get(fam)!, pick.pred, pick.hit, row.loss_value);
      }
    } else {
      addRow(f.get(fam)!, row);
    }

    if (
      row.market_id === "double_chance" &&
      (row.market_key === "1x" ||
        row.market_key === "12" ||
        row.market_key === "x2")
    ) {
      const pred = asProb(row.predicted);
      const hit = asHit(row.actual);
      const matchId = row.match_sm_id;
      if (pred != null && hit != null && matchId != null) {
        const gKey = `${league}::${matchId}`;
        if (!dcByMatch.has(gKey)) dcByMatch.set(gKey, { league, sides: [] });
        dcByMatch.get(gKey)!.sides.push({ key: row.market_key, pred, hit });
      }
    }
  }

  for (const group of dcByMatch.values()) {
    const pick = doubleChanceTopPick(group.sides);
    if (!pick) continue;
    if (!dcTopByLeague.has(group.league)) dcTopByLeague.set(group.league, newAcc());
    addSelection(dcTopByLeague.get(group.league)!, pick.pred, pick.hit, null);
  }

  const leagues: LeagueReliability[] = [];
  for (const [leagueSmId, markets] of [...byLeague.entries()].sort(
    (a, b) => a[0] - b[0]
  )) {
    const marketList: MarketReliability[] = [];
    let nRows = 0;
    for (const [key, acc] of markets) {
      const [marketId, marketKey] = key.split("::");
      const bucket = finalizeBucket(
        acc.n,
        acc.hits,
        acc.predSum,
        acc.brierSum,
        acc.logLossSum,
        acc.logLossN
      );
      nRows += bucket.n;
      marketList.push({ marketId, marketKey, ...bucket });
    }

    const x12Acc = oneXTwoTopByLeague.get(leagueSmId);
    if (x12Acc && x12Acc.n > 0) {
      const bucket = finalizeBucket(
        x12Acc.n,
        x12Acc.hits,
        x12Acc.predSum,
        x12Acc.brierSum,
        x12Acc.logLossSum,
        x12Acc.logLossN
      );
      marketList.push({
        marketId: "win_probability",
        marketKey: TOP_PICK_MARKET_KEY,
        ...bucket,
      });
      nRows += bucket.n;
    }

    const dcAcc = dcTopByLeague.get(leagueSmId);
    if (dcAcc && dcAcc.n > 0) {
      const bucket = finalizeBucket(
        dcAcc.n,
        dcAcc.hits,
        dcAcc.predSum,
        dcAcc.brierSum,
        dcAcc.logLossSum,
        dcAcc.logLossN
      );
      marketList.push({
        marketId: "double_chance",
        marketKey: TOP_PICK_MARKET_KEY,
        ...bucket,
      });
      nRows += bucket.n;
    }

    marketList.sort((a, b) => b.n - a.n);
    const byFamily: Record<string, ReliabilityBucket> = {};
    for (const [fam, acc] of familyByLeague.get(leagueSmId) ?? []) {
      byFamily[fam] = finalizeBucket(
        acc.n,
        acc.hits,
        acc.predSum,
        acc.brierSum,
        acc.logLossSum,
        acc.logLossN
      );
    }
    leagues.push({ leagueSmId, nRows, markets: marketList, byFamily });
  }

  return {
    computedAt: new Date().toISOString(),
    nRows: overall.n,
    leagues,
    overall: finalizeBucket(
      overall.n,
      overall.hits,
      overall.predSum,
      overall.brierSum,
      overall.logLossSum,
      overall.logLossN
    ),
  };
}

/** Holdout: last `holdoutFraction` of rows by match_date (per league). */
export function splitHoldoutByDate(
  rows: ReliabilityEvalRow[],
  holdoutFraction = 0.25
): { train: ReliabilityEvalRow[]; holdout: ReliabilityEvalRow[] } {
  const byLeague = new Map<number, ReliabilityEvalRow[]>();
  for (const row of rows) {
    const id = Number(row.league_sm_id);
    if (!byLeague.has(id)) byLeague.set(id, []);
    byLeague.get(id)!.push(row);
  }
  const train: ReliabilityEvalRow[] = [];
  const holdout: ReliabilityEvalRow[] = [];
  for (const list of byLeague.values()) {
    list.sort((a, b) =>
      String(a.match_date ?? "").localeCompare(String(b.match_date ?? ""))
    );
    const cut = Math.max(1, Math.floor(list.length * (1 - holdoutFraction)));
    train.push(...list.slice(0, cut));
    holdout.push(...list.slice(cut));
  }
  return { train, holdout };
}

/** True when candidate does not regress key families vs baseline beyond guardrails. */
export function passesReliabilityGuardrail(input: {
  baseline: ReliabilityBaselineReport;
  candidate: ReliabilityBaselineReport;
  maxBrierRegress?: number;
  families?: string[];
}): boolean {
  const maxRegress = input.maxBrierRegress ?? 0.02;
  const families = input.families ?? ["1x2", "ou", "btts"];
  for (const league of input.candidate.leagues) {
    const baseLeague = input.baseline.leagues.find(
      (l) => l.leagueSmId === league.leagueSmId
    );
    if (!baseLeague) continue;
    for (const fam of families) {
      const b = baseLeague.byFamily[fam];
      const c = league.byFamily[fam];
      if (!b || !c || b.n < 20 || c.n < 20) continue;
      if (c.avgBrier > b.avgBrier + maxRegress) return false;
    }
  }
  return true;
}
