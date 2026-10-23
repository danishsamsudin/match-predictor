/**
 * Pure helpers for the League xG table (xG Score, Diff, per-game rates).
 */

export type GlpmXgSource = "provider" | "proxy" | "mixed" | "none";

export type GlpmXgTableRow = {
  teamSmId: number;
  teamName: string;
  played: number;
  xgf: number;
  xga: number;
  gf: number;
  ga: number;
  xgScore: number;
  diff: number;
  tablePos: number | null;
  xgSource: GlpmXgSource;
};

/** xG Score = xGF - xGA */
export function xgScoreFromTotals(xgf: number, xga: number): number {
  return xgf - xga;
}

/** Diff = (GF - GA) - (xGF - xGA) */
export function xgDiffFromTotals(input: {
  gf: number;
  ga: number;
  xgf: number;
  xga: number;
}): number {
  return input.gf - input.ga - xgScoreFromTotals(input.xgf, input.xga);
}

/** Per-game rate; null when no matches played. */
export function perGame(total: number, played: number): number | null {
  if (!Number.isFinite(played) || played <= 0) return null;
  if (!Number.isFinite(total)) return null;
  return total / played;
}

export function classifyXgSource(providerN: number, proxyN: number): GlpmXgSource {
  if (providerN <= 0 && proxyN <= 0) return "none";
  if (providerN > 0 && proxyN > 0) return "mixed";
  if (providerN > 0) return "provider";
  return "proxy";
}

export type SeasonXgAgg = {
  teamSmId: number;
  xgf: number;
  xga: number;
  providerN: number;
  proxyN: number;
};

export type StandingJoinInput = {
  teamSmId: number;
  teamName: string;
  played: number;
  goalsFor: number;
  goalsAgainst: number;
  rank: number;
};

/** Merge standings (Pos / GF / GA / P) with season xG aggregates; rank by xG Score desc. */
export function buildXgTableRows(
  standings: StandingJoinInput[],
  xgByTeam: Map<number, SeasonXgAgg>
): GlpmXgTableRow[] {
  const rows: GlpmXgTableRow[] = standings.map((s) => {
    const agg = xgByTeam.get(s.teamSmId);
    const xgf = agg?.xgf ?? 0;
    const xga = agg?.xga ?? 0;
    const providerN = agg?.providerN ?? 0;
    const proxyN = agg?.proxyN ?? 0;
    const xgSource = classifyXgSource(providerN, proxyN);
    const score = xgScoreFromTotals(xgf, xga);
    return {
      teamSmId: s.teamSmId,
      teamName: s.teamName,
      played: s.played,
      xgf,
      xga,
      gf: s.goalsFor,
      ga: s.goalsAgainst,
      xgScore: score,
      diff: xgDiffFromTotals({
        gf: s.goalsFor,
        ga: s.goalsAgainst,
        xgf,
        xga,
      }),
      tablePos: s.rank,
      xgSource,
    };
  });

  rows.sort((a, b) => {
    if (b.xgScore !== a.xgScore) return b.xgScore - a.xgScore;
    if (b.xgf !== a.xgf) return b.xgf - a.xgf;
    return a.teamName.localeCompare(b.teamName);
  });

  return rows;
}

/** True when a clear majority of teams with xG data are proxy-only. */
export function leagueIsMostlyProxy(rows: GlpmXgTableRow[]): boolean {
  const withXg = rows.filter((r) => r.xgSource !== "none");
  if (!withXg.length) return false;
  const proxyOnly = withXg.filter((r) => r.xgSource === "proxy").length;
  return proxyOnly / withXg.length >= 0.6;
}
