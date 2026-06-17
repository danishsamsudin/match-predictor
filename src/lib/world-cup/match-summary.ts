import type { OptaParsedMatch } from "@/lib/world-cup/opta-html-parser";

export type WcMatchSummaryStat = {
  key: string;
  label: string;
  home: number | null;
  away: number | null;
  /** When true, values are percentages (0–100). */
  isPercent?: boolean;
};

export type WcMatchSummary = {
  homeGoals: number;
  awayGoals: number;
  halfTimeHome: number | null;
  halfTimeAway: number | null;
  homeXg: number | null;
  awayXg: number | null;
  venue: string | null;
  referee: string | null;
  homeFormation: string | null;
  awayFormation: string | null;
  stats: WcMatchSummaryStat[];
};

function stat(
  key: string,
  label: string,
  home: number | null | undefined,
  away: number | null | undefined,
  isPercent = false
): WcMatchSummaryStat | null {
  if (home == null && away == null) return null;
  return {
    key,
    label,
    home: home ?? null,
    away: away ?? null,
    isPercent,
  };
}

export function buildWcMatchSummary(parsed: OptaParsedMatch): WcMatchSummary {
  const ws = parsed.widgetStats;
  const nf = parsed.narrativeFeatures;

  const possessionHome = ws?.home.possessionPct ?? nf.possessionHomePct;
  const possessionAway = ws?.away.possessionPct ?? nf.possessionAwayPct;

  const stats: WcMatchSummaryStat[] = [];
  const rows: Array<WcMatchSummaryStat | null> = [
    stat("possession", "Possession", possessionHome, possessionAway, true),
    stat("xg", "Expected goals (xG)", parsed.homeXg, parsed.awayXg),
    stat("shots", "Shots", parsed.homeShots ?? ws?.home.shots, parsed.awayShots ?? ws?.away.shots),
    stat(
      "sot",
      "Shots on target",
      parsed.homeShotsOnTarget ?? ws?.home.shotsOnTarget,
      parsed.awayShotsOnTarget ?? ws?.away.shotsOnTarget
    ),
    stat("corners", "Corners", parsed.homeCorners ?? ws?.home.cornersWon, parsed.awayCorners ?? ws?.away.cornersWon),
    stat(
      "fouls",
      "Fouls",
      parsed.homeFoulsConceded ?? ws?.home.foulsConceded,
      parsed.awayFoulsConceded ?? ws?.away.foulsConceded
    ),
    stat(
      "yellow",
      "Yellow cards",
      nf.yellowCardsHome ?? ws?.home.yellowCards,
      nf.yellowCardsAway ?? ws?.away.yellowCards
    ),
    stat("red", "Red cards", nf.redCardsHome ?? ws?.home.redCards, nf.redCardsAway ?? ws?.away.redCards),
    stat("passes", "Passes", ws?.home.passes, ws?.away.passes),
    stat("passAcc", "Pass accuracy", ws?.home.passingAccuracyPct, ws?.away.passingAccuracyPct, true),
    stat("offsides", "Offsides", ws?.home.offsides, ws?.away.offsides),
    stat("tackles", "Tackles", ws?.home.tackles, ws?.away.tackles),
    stat("interceptions", "Interceptions", ws?.home.interceptions, ws?.away.interceptions),
  ];

  for (const row of rows) {
    if (row) stats.push(row);
  }

  return {
    homeGoals: parsed.homeGoals,
    awayGoals: parsed.awayGoals,
    halfTimeHome: parsed.halfTimeHome,
    halfTimeAway: parsed.halfTimeAway,
    homeXg: parsed.homeXg,
    awayXg: parsed.awayXg,
    venue: parsed.venue,
    referee: parsed.referee,
    homeFormation: parsed.homeFormation,
    awayFormation: parsed.awayFormation,
    stats,
  };
}

export function parseWcMatchSummaryFromIngest(parsed: unknown): WcMatchSummary | null {
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  const summary = p.matchSummary;
  if (summary && typeof summary === "object") {
    const s = summary as WcMatchSummary;
    if (Array.isArray(s.stats)) return s;
  }

  const homeGoals = typeof p.homeGoals === "number" ? p.homeGoals : null;
  const awayGoals = typeof p.awayGoals === "number" ? p.awayGoals : null;
  if (homeGoals == null || awayGoals == null) return null;

  const homeXg = typeof p.homeXg === "number" ? p.homeXg : null;
  const awayXg = typeof p.awayXg === "number" ? p.awayXg : null;
  const stats: WcMatchSummaryStat[] = [];
  const xgRow = stat("xg", "Expected goals (xG)", homeXg, awayXg);
  if (xgRow) stats.push(xgRow);

  return {
    homeGoals,
    awayGoals,
    halfTimeHome: null,
    halfTimeAway: null,
    homeXg,
    awayXg,
    venue: null,
    referee: null,
    homeFormation: null,
    awayFormation: null,
    stats,
  };
}

export function enrichSummaryFromNarrative(
  summary: WcMatchSummary,
  narrative: unknown
): WcMatchSummary {
  if (!narrative || typeof narrative !== "object") return summary;
  const n = narrative as Record<string, unknown>;

  const possessionHome =
    typeof n.possessionHomePct === "number" ? n.possessionHomePct : null;
  const possessionAway =
    typeof n.possessionAwayPct === "number" ? n.possessionAwayPct : null;
  const yellowHome = typeof n.yellowCardsHome === "number" ? n.yellowCardsHome : null;
  const yellowAway = typeof n.yellowCardsAway === "number" ? n.yellowCardsAway : null;
  const redHome = typeof n.redCardsHome === "number" ? n.redCardsHome : null;
  const redAway = typeof n.redCardsAway === "number" ? n.redCardsAway : null;

  const extra: WcMatchSummaryStat[] = [];
  const possession = stat("possession", "Possession", possessionHome, possessionAway, true);
  const yellow = stat("yellow", "Yellow cards", yellowHome, yellowAway);
  const red = stat("red", "Red cards", redHome, redAway);
  if (possession) extra.push(possession);
  if (yellow) extra.push(yellow);
  if (red) extra.push(red);

  const existingKeys = new Set(summary.stats.map((s) => s.key));
  const mergedStats = [
    ...summary.stats,
    ...extra.filter((s) => !existingKeys.has(s.key)),
  ];

  return { ...summary, stats: mergedStats };
}
