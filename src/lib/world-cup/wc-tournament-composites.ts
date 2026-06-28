import type { ParsedOptaFixture, ParsedOptaPlayerRow, PlayerSide } from "@/lib/world-cup/opta-player-stats-parser";

export interface TeamTerritoryInput {
  possessionPct: number | null;
  finalThirdEntries: number | null;
  penaltyAreaEntries: number | null;
}

export interface TeamMatchComposite {
  matchId: string;
  teamApiId: number;
  side: PlayerSide;
  chanceIndex: number;
  finishingDelta: number;
  defensiveSolidity: number;
  territoryIndex: number;
  gkSaveIndex: number;
  disciplineLoad: number;
  opponentStrength: number;
  payload: Record<string, unknown>;
}

export interface PlayerTournamentFormRow {
  teamApiId: number;
  optaPlayerId: string;
  playerName: string;
  matchesPlayed: number;
  minutesTotal: number;
  avgOptaPoints: number | null;
  chanceIndexPer90: number | null;
  defensiveActionsPer90: number | null;
  gkSaveIndex: number | null;
  yellowCards: number;
  wasLastStarter: boolean;
  availabilityFactor: number;
  payload: Record<string, unknown>;
}

const WINSOR_CAP = 2.5;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function winsorize(value: number, cap = WINSOR_CAP): number {
  return clamp(value, -cap, cap);
}

function num(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Integer card counts from Match Summary — ignore Opta Points contributions. */
export function disciplineCardCount(
  stats: Record<string, number | string | boolean | null>,
  kind: "yellow" | "red"
): number {
  const keys =
    kind === "yellow"
      ? ["cards_yellow", "yellow", "YC"]
      : ["cards_red", "red", "RC"];
  for (const key of keys) {
    const raw = stats[key];
    const n = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(n) && n >= 0 && Number.isInteger(n)) return n;
  }
  return 0;
}

function minutesWeight(minutes: number | null): number {
  if (minutes == null || minutes <= 0) return 0.15;
  return clamp(minutes / 90, 0.1, 1);
}

function playerChanceContribution(p: ParsedOptaPlayerRow): number {
  const w = minutesWeight(p.minutes);
  const xg = num(p.stats.expectedGoals ?? p.stats.xg);
  const sca = num(p.stats.shotCreated ?? p.stats.shot_created);
  const sib = num(p.stats.attemptsIbox ?? p.stats.attemptsIbox);
  return (xg * 1.2 + sca * 0.18 + sib * 0.06) * w;
}

function playerDefensiveContribution(p: ParsedOptaPlayerRow): number {
  const w = minutesWeight(p.minutes);
  const tackles = num(p.stats.tackles);
  const interceptions = num(p.stats.interceptions);
  const blocks = num(p.stats.shots_blocked ?? p.stats.shots_blocked);
  return (tackles * 0.35 + interceptions * 0.4 + blocks * 0.25) * w;
}

function normalizeTerritory(input: TeamTerritoryInput | null): number {
  if (!input) return 0.5;
  const poss = (input.possessionPct ?? 50) / 100;
  const fte = clamp((input.finalThirdEntries ?? 30) / 60, 0, 1.5);
  const pae = clamp((input.penaltyAreaEntries ?? 15) / 30, 0, 1.5);
  return clamp(0.45 * poss + 0.35 * (fte / 1.5) + 0.2 * (pae / 1.5), 0, 1);
}

export function computeTeamMatchComposite(input: {
  matchId: string;
  teamApiId: number;
  side: PlayerSide;
  players: ParsedOptaPlayerRow[];
  teamGoals: number | null;
  teamXg: number | null;
  shotsOnTargetAgainst: number | null;
  territory: TeamTerritoryInput | null;
  opponentStrength: number;
}): TeamMatchComposite {
  const teamPlayers = input.players.filter((p) => p.side === input.side);
  const xi = teamPlayers.filter((p) => p.isStarter);
  const xiMinutes = xi.reduce((s, p) => s + (p.minutes ?? 0), 0) || 1;

  const chanceIndex = teamPlayers.reduce((s, p) => s + playerChanceContribution(p), 0);
  const defensiveSolidity =
    teamPlayers.reduce((s, p) => s + playerDefensiveContribution(p), 0) +
    (input.shotsOnTargetAgainst != null ? input.shotsOnTargetAgainst * 0.15 : 0);

  const gk = teamPlayers.find((p) => p.position === "GK" || p.stats.saves_total != null);
  const gkSaveIndex = gk
    ? num(gk.stats.saves_total ?? gk.stats.saves) * 0.5 -
      num(gk.stats.goals_conceeded ?? gk.stats.goals_conceeded) * 0.3 +
      num(gk.stats.penalties_saved) * 0.8
    : 0;

  const yellows = teamPlayers.reduce(
    (s, p) => s + disciplineCardCount(p.stats, "yellow"),
    0
  );
  const reds = teamPlayers.reduce((s, p) => s + disciplineCardCount(p.stats, "red"), 0);
  const disciplineLoad = (yellows * 0.25 + reds * 1.5) / Math.max(1, teamPlayers.length);

  const finishingDelta = winsorize(
    (input.teamGoals ?? 0) - (input.teamXg ?? input.teamGoals ?? 0)
  );

  const avgOptaPoints =
    xi.length > 0
      ? xi.reduce((s, p) => s + (p.optaPoints ?? 0), 0) / xi.length
      : null;

  return {
    matchId: input.matchId,
    teamApiId: input.teamApiId,
    side: input.side,
    chanceIndex: winsorize(chanceIndex),
    finishingDelta,
    defensiveSolidity: winsorize(defensiveSolidity),
    territoryIndex: normalizeTerritory(input.territory),
    gkSaveIndex: winsorize(gkSaveIndex),
    disciplineLoad: winsorize(disciplineLoad, 3),
    opponentStrength: input.opponentStrength,
    payload: {
      xi_avg_opta_points: avgOptaPoints,
      xi_minutes: xiMinutes,
      player_count: teamPlayers.length,
      yellows,
      reds,
    },
  };
}

export function computePlayerTournamentForm(
  rows: Array<{
    matchId: string;
    matchDate: string | null;
    player: ParsedOptaPlayerRow;
    teamApiId: number;
  }>
): PlayerTournamentFormRow[] {
  const byPlayer = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.teamApiId}|${row.player.optaPlayerId}`;
    const list = byPlayer.get(key) ?? [];
    list.push(row);
    byPlayer.set(key, list);
  }

  const result: PlayerTournamentFormRow[] = [];

  for (const [, matches] of byPlayer) {
    matches.sort((a, b) => (b.matchDate ?? "").localeCompare(a.matchDate ?? ""));
    const latest = matches[0];
    const p = latest.player;
    let minutesTotal = 0;
    let optaSum = 0;
    let optaCount = 0;
    let chanceSum = 0;
    let defSum = 0;
    let yellowCards = 0;
    let gkIndex: number | null = null;

    for (const m of matches) {
      const pl = m.player;
      minutesTotal += pl.minutes ?? 0;
      if (pl.optaPoints != null) {
        optaSum += pl.optaPoints;
        optaCount += 1;
      }
      chanceSum += playerChanceContribution(pl);
      defSum += playerDefensiveContribution(pl);
      yellowCards += disciplineCardCount(pl.stats, "yellow");
      if (pl.position === "GK" || pl.stats.saves_total != null) {
        gkIndex =
          num(pl.stats.saves_total ?? pl.stats.saves) * 0.5 -
          num(pl.stats.goals_conceeded) * 0.3;
      }
    }

    const per90 = minutesTotal > 0 ? 90 / minutesTotal : 0;
    const fatigue = clamp(minutesTotal / 360, 0, 1);
    const cardPenalty = clamp(yellowCards * 0.08, 0, 0.35);
    const availabilityFactor = clamp(1 - fatigue * 0.12 - cardPenalty, 0.55, 1);

    result.push({
      teamApiId: latest.teamApiId,
      optaPlayerId: p.optaPlayerId,
      playerName: p.playerName,
      matchesPlayed: matches.length,
      minutesTotal,
      avgOptaPoints: optaCount > 0 ? optaSum / optaCount : null,
      chanceIndexPer90: chanceSum * per90,
      defensiveActionsPer90: defSum * per90,
      gkSaveIndex: gkIndex,
      yellowCards,
      wasLastStarter: p.isStarter,
      availabilityFactor,
      payload: { last_match_id: latest.matchId, last_position: p.position ?? null },
    });
  }

  return result;
}

export function opponentAdjustedCompositeMean(
  composites: TeamMatchComposite[],
  field: keyof Pick<
    TeamMatchComposite,
    "chanceIndex" | "defensiveSolidity" | "finishingDelta" | "territoryIndex" | "disciplineLoad"
  >
): number {
  if (!composites.length) return 0;
  let sum = 0;
  let w = 0;
  for (const c of composites) {
    const adj = c.opponentStrength > 0 ? c[field] / c.opponentStrength : c[field];
    const weight = 1 / Math.max(0.7, c.opponentStrength);
    sum += adj * weight;
    w += weight;
  }
  return w > 0 ? sum / w : 0;
}

export function buildCompositesForFixture(input: {
  matchId: string;
  parsed: ParsedOptaFixture;
  homeTerritory: TeamTerritoryInput | null;
  awayTerritory: TeamTerritoryInput | null;
  homeXg: number | null;
  awayXg: number | null;
  homeOpponentStrength: number;
  awayOpponentStrength: number;
}): TeamMatchComposite[] {
  const { parsed } = input;
  const homeSotAgainst = parsed.players
    .filter((p) => p.side === "away")
    .reduce((s, p) => s + num(p.stats.shots_on_target ?? p.stats.shots_on_target), 0);
  const awaySotAgainst = parsed.players
    .filter((p) => p.side === "home")
    .reduce((s, p) => s + num(p.stats.shots_on_target ?? p.stats.shots_on_target), 0);

  if (!parsed.homeTeamApiId || !parsed.awayTeamApiId) return [];

  return [
    computeTeamMatchComposite({
      matchId: input.matchId,
      teamApiId: parsed.homeTeamApiId,
      side: "home",
      players: parsed.players,
      teamGoals: parsed.homeGoals,
      teamXg: input.homeXg,
      shotsOnTargetAgainst: awaySotAgainst || null,
      territory: input.homeTerritory,
      opponentStrength: input.homeOpponentStrength,
    }),
    computeTeamMatchComposite({
      matchId: input.matchId,
      teamApiId: parsed.awayTeamApiId,
      side: "away",
      players: parsed.players,
      teamGoals: parsed.awayGoals,
      teamXg: input.awayXg,
      shotsOnTargetAgainst: homeSotAgainst || null,
      territory: input.awayTerritory,
      opponentStrength: input.awayOpponentStrength,
    }),
  ];
}
