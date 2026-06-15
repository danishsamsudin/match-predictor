import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
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
