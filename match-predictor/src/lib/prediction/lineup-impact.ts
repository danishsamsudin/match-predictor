import type { FixtureLineup, TopScorer } from "@/lib/types/football";
import type { LineupImpactResult } from "@/lib/types/prediction";

const STARTER_FORM_THRESHOLD = 6.5;
const BENCH_FORM_THRESHOLD = 6.3;

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

export function applySquadFormDecay(
  lineup: FixtureLineup | undefined,
  multiplier: number
): { multiplier: number; note?: string } {
  if (!lineup) return { multiplier };

  const outOfFormStarters = lineup.startXI.filter(
    (p) => p.player.averageRating != null && p.player.averageRating < STARTER_FORM_THRESHOLD
  ).length;

  const outOfFormSubs =
    lineup.substitutes?.filter(
      (p) => p.player.averageRating != null && p.player.averageRating < BENCH_FORM_THRESHOLD
    ).length ?? 0;

  let squadDeficit = 0;
  if (outOfFormStarters > 3) squadDeficit += outOfFormStarters * 0.03;
  if (outOfFormSubs > 3) squadDeficit += outOfFormSubs * 0.015;

  if (squadDeficit === 0) return { multiplier };

  const next = multiplier * Math.max(0.75, 1.0 - squadDeficit);
  const parts: string[] = [];
  if (outOfFormStarters > 3) {
    parts.push(`${outOfFormStarters} starters below ${STARTER_FORM_THRESHOLD}`);
  }
  if (outOfFormSubs > 3) {
    parts.push(`${outOfFormSubs} bench players below ${BENCH_FORM_THRESHOLD}`);
  }
  return {
    multiplier: next,
    note: `Squad form decay (${parts.join("; ")}) — attacking xG ×${next.toFixed(2)}.`,
  };
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

  const homeDecay = applySquadFormDecay(homeLineup, homeXgMultiplier);
  homeXgMultiplier = homeDecay.multiplier;
  if (homeDecay.note) notes.push(homeDecay.note);

  const awayDecay = applySquadFormDecay(awayLineup, awayXgMultiplier);
  awayXgMultiplier = awayDecay.multiplier;
  if (awayDecay.note) notes.push(awayDecay.note);

  if (notes.length === 0) {
    notes.push("Full strength lineups expected — no major absences detected.");
  }

  return { homeXgMultiplier, awayXgMultiplier, notes };
}
