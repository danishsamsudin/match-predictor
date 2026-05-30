import type { FixtureLineup, TopScorer } from "@/lib/types/football";
import type { LineupImpactResult } from "@/lib/types/prediction";

function getStarterIds(lineup: FixtureLineup | undefined): Set<number> {
  if (!lineup) return new Set();
  return new Set(lineup.startXI.map((p) => p.player.id));
}

function hasGoalkeeper(lineup: FixtureLineup | undefined): boolean {
  if (!lineup) return true;
  return lineup.startXI.some((p) => p.player.pos === "G");
}

function getTopScorersForTeam(
  topScorers: TopScorer[],
  teamId: number,
  limit = 3
): TopScorer[] {
  return topScorers
    .filter((s) => s.statistics.some((st) => st.team.id === teamId))
    .sort((a, b) => {
      const goalsA = a.statistics[0]?.goals.total ?? 0;
      const goalsB = b.statistics[0]?.goals.total ?? 0;
      return goalsB - goalsA;
    })
    .slice(0, limit);
}

export function computeLineupImpact(
  lineups: FixtureLineup[],
  topScorers: TopScorer[],
  homeTeamId: number,
  awayTeamId: number
): LineupImpactResult {
  const homeLineup = lineups.find((l) => l.team.id === homeTeamId);
  const awayLineup = lineups.find((l) => l.team.id === awayTeamId);
  const homeStarters = getStarterIds(homeLineup);
  const awayStarters = getStarterIds(awayLineup);

  let homeXgMultiplier = 1;
  let awayXgMultiplier = 1;
  const notes: string[] = [];

  const homeTopScorers = getTopScorersForTeam(topScorers, homeTeamId);
  const awayTopScorers = getTopScorersForTeam(topScorers, awayTeamId);

  if (homeTopScorers.length > 0 && !homeStarters.has(homeTopScorers[0].player.id)) {
    homeXgMultiplier *= 0.8;
    notes.push(
      `Home team missing top scorer ${homeTopScorers[0].player.name} (-20% xG).`
    );
  }

  if (awayTopScorers.length > 0 && !awayStarters.has(awayTopScorers[0].player.id)) {
    awayXgMultiplier *= 0.8;
    notes.push(
      `Away team missing top scorer ${awayTopScorers[0].player.name} (-20% xG).`
    );
  }

  if (!hasGoalkeeper(homeLineup)) {
    awayXgMultiplier *= 1.15;
    notes.push("Home team missing starting goalkeeper (+15% away xG).");
  }

  if (!hasGoalkeeper(awayLineup)) {
    homeXgMultiplier *= 1.15;
    notes.push("Away team missing starting goalkeeper (+15% home xG).");
  }

  if (notes.length === 0) {
    notes.push("Full strength lineups expected — no major absences detected.");
  }

  return { homeXgMultiplier, awayXgMultiplier, notes };
}
