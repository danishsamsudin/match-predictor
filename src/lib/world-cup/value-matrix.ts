import { removeOverroundMpto, type OutcomeOdds } from "@/lib/prediction/odds-value";

export function computeRawBetEdge(pModel: number, oBook: number): number {
  if (!Number.isFinite(pModel) || !Number.isFinite(oBook) || oBook <= 1) return -1;
  return pModel * oBook - 1;
}

export function pureLineDiscrepancyPct(pModel: number, pMarket: number): number {
  return (pModel - pMarket) * 100;
}

export function isActionableEdge(rawBetEdge: number, pureLineDiscrepancyPp: number): boolean {
  return rawBetEdge > 0 && pureLineDiscrepancyPp > 2.0;
}

export function mptoMarketProbabilities(odds: OutcomeOdds): {
  home: number;
  draw: number;
  away: number;
  overround: number;
} {
  const fair = removeOverroundMpto(odds);
  const homeRaw = 100 / odds.home;
  const drawRaw = 100 / odds.draw;
  const awayRaw = 100 / odds.away;
  const overround = homeRaw + drawRaw + awayRaw - 100;
  return {
    home: fair.homePct / 100,
    draw: fair.drawPct / 100,
    away: fair.awayPct / 100,
    overround,
  };
}

export interface OutcomeEdgeRow {
  label: string;
  modelPct: number;
  rawBetEdgePct: number;
  pureLineDiscrepancyPp: number;
  actionable: boolean;
}

export function computeOutcomeEdges(
  model: { home: number; draw: number; away: number },
  odds: OutcomeOdds
): OutcomeEdgeRow[] {
  const market = mptoMarketProbabilities(odds);
  const defs = [
    { label: "Home Win", pModel: model.home, pMarket: market.home, oBook: odds.home },
    { label: "Draw", pModel: model.draw, pMarket: market.draw, oBook: odds.draw },
    { label: "Away Win", pModel: model.away, pMarket: market.away, oBook: odds.away },
  ];

  return defs.map(({ label, pModel, pMarket, oBook }) => {
    const raw = computeRawBetEdge(pModel, oBook);
    const disc = pureLineDiscrepancyPct(pModel, pMarket);
    return {
      label,
      modelPct: pModel * 100,
      rawBetEdgePct: raw * 100,
      pureLineDiscrepancyPp: disc,
      actionable: isActionableEdge(raw, disc),
    };
  });
}
