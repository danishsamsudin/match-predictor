import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { resolveOfficialFixtureTeams } from "@/lib/world-cup/fixture-venues";
import { buildWcMatchSummary } from "@/lib/world-cup/match-summary";
import { findOptaParsedMatch } from "@/lib/world-cup/resolve-opta-from-html";
import type { WcMatchSummary, WcMatchSummaryStat } from "@/lib/world-cup/match-summary";
import type {
  OptaNarrativeFeatures,
  OptaParsedMatch,
} from "@/lib/world-cup/opta-html-parser";
import type { OptaWidgetMatchStats } from "@/lib/world-cup/opta-widget-stats";

function norm(name: string): string {
  return normalizeNationalTeamName(name);
}

/** True when source home/away are reversed relative to the official fixture. */
export function namesNeedHomeAwaySwap(
  fixtureHome: string,
  fixtureAway: string,
  sourceHome: string | null | undefined,
  sourceAway: string | null | undefined
): boolean {
  if (!sourceHome?.trim() || !sourceAway?.trim()) return false;
  const fh = norm(fixtureHome);
  const fa = norm(fixtureAway);
  const sh = norm(sourceHome);
  const sa = norm(sourceAway);
  if (sh === fh && sa === fa) return false;
  if (sh === fa && sa === fh) return true;
  return false;
}

export function swapWcMatchSummaryStat(stat: WcMatchSummaryStat): WcMatchSummaryStat {
  return {
    ...stat,
    home: stat.away,
    away: stat.home,
  };
}

export function swapWcMatchSummary(summary: WcMatchSummary): WcMatchSummary {
  return {
    homeGoals: summary.awayGoals,
    awayGoals: summary.homeGoals,
    halfTimeHome: summary.halfTimeAway,
    halfTimeAway: summary.halfTimeHome,
    homeXg: summary.awayXg,
    awayXg: summary.homeXg,
    venue: summary.venue,
    referee: summary.referee,
    homeFormation: summary.awayFormation,
    awayFormation: summary.homeFormation,
    stats: summary.stats.map(swapWcMatchSummaryStat),
  };
}

export function alignWcMatchSummaryToFixture(
  summary: WcMatchSummary,
  fixtureHome: string,
  fixtureAway: string,
  sourceHome: string | null | undefined,
  sourceAway: string | null | undefined
): WcMatchSummary {
  if (!namesNeedHomeAwaySwap(fixtureHome, fixtureAway, sourceHome, sourceAway)) {
    return summary;
  }
  return swapWcMatchSummary(summary);
}

export function alignGoalsToFixture(
  homeGoals: number | null,
  awayGoals: number | null,
  fixtureHome: string,
  fixtureAway: string,
  sourceHome: string | null | undefined,
  sourceAway: string | null | undefined
): { homeGoals: number | null; awayGoals: number | null } {
  if (!namesNeedHomeAwaySwap(fixtureHome, fixtureAway, sourceHome, sourceAway)) {
    return { homeGoals, awayGoals };
  }
  return { homeGoals: awayGoals, awayGoals: homeGoals };
}

/** Move goal counts from one home/away naming to another (same two teams). */
export function mapGoalsBetweenOrientations(
  homeGoals: number | null,
  awayGoals: number | null,
  fromHome: string,
  fromAway: string,
  toHome: string,
  toAway: string
): { homeGoals: number | null; awayGoals: number | null } {
  return alignGoalsToFixture(homeGoals, awayGoals, toHome, toAway, fromHome, fromAway);
}

export type RecentMatchDisplayAlignInput = {
  date: string | null;
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  summary: WcMatchSummary | null;
  ingestSourceHome?: string | null;
  ingestSourceAway?: string | null;
  ingestSourceHomeGoals?: number | null;
  ingestSourceAwayGoals?: number | null;
};

/**
 * Align recent-result rows to the official schedule home/away and correct scores.
 * Prefers ingest/Opta scores (mapped to official orientation) over raw DB columns.
 */
export function alignRecentMatchDisplay(input: RecentMatchDisplayAlignInput): {
  homeTeamName: string;
  awayTeamName: string;
  homeGoals: number | null;
  awayGoals: number | null;
  summary: WcMatchSummary | null;
} {
  const official = resolveOfficialFixtureTeams({
    date: input.date,
    homeName: input.homeTeamName,
    awayName: input.awayTeamName,
  });
  const displayHome = official?.home ?? input.homeTeamName;
  const displayAway = official?.away ?? input.awayTeamName;

  const opta = findOptaParsedMatch({
    date: input.date,
    homeName: input.homeTeamName,
    awayName: input.awayTeamName,
  });

  const scoreSourceHome = opta?.homeTeamName ?? input.ingestSourceHome ?? null;
  const scoreSourceAway = opta?.awayTeamName ?? input.ingestSourceAway ?? null;
  const scoreHomeGoals = opta?.homeGoals ?? input.ingestSourceHomeGoals ?? null;
  const scoreAwayGoals = opta?.awayGoals ?? input.ingestSourceAwayGoals ?? null;

  let summary = input.summary;
  if (opta) {
    const oriented = alignOptaParsedMatchToFixture(opta, displayHome, displayAway);
    summary = buildWcMatchSummary(oriented);
  } else if (summary && scoreSourceHome && scoreSourceAway) {
    summary = alignWcMatchSummaryToFixture(
      summary,
      displayHome,
      displayAway,
      scoreSourceHome,
      scoreSourceAway
    );
  }

  let homeGoals = input.homeGoals;
  let awayGoals = input.awayGoals;

  if (summary) {
    homeGoals = summary.homeGoals;
    awayGoals = summary.awayGoals;
  } else if (
    scoreHomeGoals != null &&
    scoreAwayGoals != null &&
    scoreSourceHome &&
    scoreSourceAway
  ) {
    ({ homeGoals, awayGoals } = alignGoalsToFixture(
      scoreHomeGoals,
      scoreAwayGoals,
      displayHome,
      displayAway,
      scoreSourceHome,
      scoreSourceAway
    ));
  }

  return {
    homeTeamName: displayHome,
    awayTeamName: displayAway,
    homeGoals,
    awayGoals,
    summary,
  };
}

function swapWidgetStats(stats: OptaWidgetMatchStats | null): OptaWidgetMatchStats | null {
  if (!stats) return null;
  const raw: Record<string, { home: number | null; away: number | null }> = {};
  for (const [label, pair] of Object.entries(stats.raw)) {
    raw[label] = { home: pair.away, away: pair.home };
  }
  return {
    home: stats.away,
    away: stats.home,
    raw,
    labelCount: stats.labelCount,
  };
}

export function swapOptaNarrativeFeatures(
  features: OptaNarrativeFeatures
): OptaNarrativeFeatures {
  return {
    ...features,
    redCardsHome: features.redCardsAway,
    redCardsAway: features.redCardsHome,
    yellowCardsHome: features.yellowCardsAway,
    yellowCardsAway: features.yellowCardsHome,
    possessionHomePct: features.possessionAwayPct,
    possessionAwayPct: features.possessionHomePct,
    dominantPossessionSide:
      features.dominantPossessionSide === "home"
        ? "away"
        : features.dominantPossessionSide === "away"
          ? "home"
          : null,
  };
}

/** Re-orient Opta parse to match official fixture home/away. */
export function swapOptaParsedMatch(parsed: OptaParsedMatch): OptaParsedMatch {
  return {
    ...parsed,
    homeTeamName: parsed.awayTeamName,
    awayTeamName: parsed.homeTeamName,
    homeTeamApiId: parsed.awayTeamApiId,
    awayTeamApiId: parsed.homeTeamApiId,
    homeGoals: parsed.awayGoals,
    awayGoals: parsed.homeGoals,
    halfTimeHome: parsed.halfTimeAway,
    halfTimeAway: parsed.halfTimeHome,
    homeFormation: parsed.awayFormation,
    awayFormation: parsed.homeFormation,
    homeXg: parsed.awayXg,
    awayXg: parsed.homeXg,
    homeShots: parsed.awayShots,
    awayShots: parsed.homeShots,
    homeShotsOnTarget: parsed.awayShotsOnTarget,
    awayShotsOnTarget: parsed.homeShotsOnTarget,
    homeCorners: parsed.awayCorners,
    awayCorners: parsed.homeCorners,
    homeFoulsConceded: parsed.awayFoulsConceded,
    awayFoulsConceded: parsed.homeFoulsConceded,
    widgetStats: swapWidgetStats(parsed.widgetStats),
    narrativeFeatures: swapOptaNarrativeFeatures(parsed.narrativeFeatures),
  };
}

export function alignOptaParsedMatchToFixture(
  parsed: OptaParsedMatch,
  fixtureHome: string,
  fixtureAway: string
): OptaParsedMatch {
  if (!namesNeedHomeAwaySwap(fixtureHome, fixtureAway, parsed.homeTeamName, parsed.awayTeamName)) {
    return parsed;
  }
  return swapOptaParsedMatch(parsed);
}
