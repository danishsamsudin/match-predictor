import { readFileSync } from "fs";
import path from "path";
import { SM_LEAGUE } from "@/lib/sportmonks/constants";
import { TOP_PICK_MARKET_KEY } from "@/lib/glpm/reliability-baseline";

/**
 * Public marketing metrics from locked GLPM reliability baselines.
 *
 * Uses specific primary lines / selection rules so we never publish structural
 * constants (e.g. pooling all DC sides ≈ 66.7%).
 */

export type MarketMetricId = "btts" | "ou25" | "oneXTwo" | "dc";

export type MarketMetric = {
  n: number;
  hitRate: number;
  avgPred: number;
  calibrationGap: number;
  avgBrier: number;
  /** Human-readable line label for tooltips / footnotes. */
  lineLabel: string;
};

export type LeaguePerformanceRow = {
  leagueSmId: number;
  leagueName: string;
  /** Match count from the primary binary markets (not raw market-key rows). */
  matchSampleSize: number;
  metrics: Record<MarketMetricId, MarketMetric | null>;
};

export type LeaguePerformanceSummary = {
  computedAt: string | null;
  source: "glpm-reliability-baseline";
  leagues: LeaguePerformanceRow[];
};

const LEAGUE_NAMES: Record<number, string> = {
  [SM_LEAGUE.PREMIER_LEAGUE]: "Premier League",
  [SM_LEAGUE.EREDIVISIE]: "Eredivisie",
  [SM_LEAGUE.SERIE_A]: "Serie A",
  [SM_LEAGUE.BUNDESLIGA]: "Bundesliga",
  [SM_LEAGUE.CHAMPIONSHIP]: "Championship",
};

/** Main research lines shown on marketing. */
const MARKETING_LINES = {
  btts: { marketId: "btts", marketKey: "", lineLabel: "BTTS yes" },
  ou25: { marketId: "goals_over_under", marketKey: "2.5", lineLabel: "Over 2.5" },
  oneXTwo: {
    marketId: "win_probability",
    marketKey: TOP_PICK_MARKET_KEY,
    lineLabel: "1X2 top pick (highest of home / draw / away)",
  },
  dc: {
    marketId: "double_chance",
    marketKey: TOP_PICK_MARKET_KEY,
    lineLabel: "DC top pick (highest of 1X / 12 / X2)",
  },
} as const;

type BaselineMarket = {
  marketId: string;
  marketKey?: string;
  n: number;
  hits: number;
  hitRate: number;
  avgPred: number;
  calibrationGap: number;
  avgBrier: number;
};

type BaselineLeague = {
  leagueSmId: number;
  nRows: number;
  markets: BaselineMarket[];
};

type BaselineFile = {
  computedAt?: string;
  nRows?: number;
  leagues: BaselineLeague[];
};

function loadBaselineFile(): BaselineFile | null {
  try {
    const filePath = path.join(
      process.cwd(),
      "data/glpm/calibration/baselines/latest.json"
    );
    const raw = readFileSync(filePath, "utf8");
    return JSON.parse(raw) as BaselineFile;
  } catch {
    return null;
  }
}

function toMetric(
  m: BaselineMarket | undefined,
  lineLabel: string
): MarketMetric | null {
  if (!m || m.n <= 0) return null;
  return {
    n: m.n,
    hitRate: m.hitRate,
    avgPred: m.avgPred,
    calibrationGap: m.calibrationGap,
    avgBrier: m.avgBrier,
    lineLabel,
  };
}

function findMarket(
  markets: BaselineMarket[],
  marketId: string,
  marketKey: string
): BaselineMarket | undefined {
  return markets.find((m) => {
    if (m.marketId !== marketId) return false;
    return (m.marketKey ?? "") === marketKey;
  });
}

export function formatPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

export function getLeaguePerformanceSummary(): LeaguePerformanceSummary {
  const baseline = loadBaselineFile();
  if (!baseline?.leagues?.length) {
    return { computedAt: null, source: "glpm-reliability-baseline", leagues: [] };
  }

  const order = [
    SM_LEAGUE.PREMIER_LEAGUE,
    SM_LEAGUE.EREDIVISIE,
    SM_LEAGUE.SERIE_A,
    SM_LEAGUE.BUNDESLIGA,
    SM_LEAGUE.CHAMPIONSHIP,
  ];

  const byId = new Map(baseline.leagues.map((l) => [l.leagueSmId, l]));
  const leagues: LeaguePerformanceRow[] = [];

  for (const id of order) {
    const row = byId.get(id);
    if (!row) continue;

    const metrics = {
      btts: toMetric(
        findMarket(row.markets, MARKETING_LINES.btts.marketId, MARKETING_LINES.btts.marketKey),
        MARKETING_LINES.btts.lineLabel
      ),
      ou25: toMetric(
        findMarket(row.markets, MARKETING_LINES.ou25.marketId, MARKETING_LINES.ou25.marketKey),
        MARKETING_LINES.ou25.lineLabel
      ),
      oneXTwo: toMetric(
        findMarket(
          row.markets,
          MARKETING_LINES.oneXTwo.marketId,
          MARKETING_LINES.oneXTwo.marketKey
        ),
        MARKETING_LINES.oneXTwo.lineLabel
      ),
      dc: toMetric(
        findMarket(row.markets, MARKETING_LINES.dc.marketId, MARKETING_LINES.dc.marketKey),
        MARKETING_LINES.dc.lineLabel
      ),
    };

    leagues.push({
      leagueSmId: id,
      leagueName: LEAGUE_NAMES[id] ?? `League ${id}`,
      matchSampleSize:
        metrics.btts?.n ??
        metrics.ou25?.n ??
        metrics.oneXTwo?.n ??
        metrics.dc?.n ??
        0,
      metrics,
    });
  }

  return {
    computedAt: baseline.computedAt ?? null,
    source: "glpm-reliability-baseline",
    leagues,
  };
}
