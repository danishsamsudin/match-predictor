/** Opta match-centre widget stat labels (General, Attack, Defence, Discipline tabs). */
export const OPTA_STAT = {
  goals: "Goals",
  possession: "Possession",
  shots: "Shots",
  shotsOnTarget: "Shots on target",
  shotsInsideBox: "Shots inside the box",
  shotsOutsideBox: "Shots outside the box",
  blockedShots: "Blocked shots",
  shootingAccuracy: "Shooting accuracy",
  cornersWon: "Corners won",
  cornerAwarded: "Corner awarded",
  crosses: "Crosses",
  openPlayCrosses: "Total open play crosses",
  crossingAccuracy: "Crossing accuracy",
  finalThirdEntries: "Final third entries",
  penaltyAreaEntries: "Penalty area entries",
  keyPasses: "Key Passes",
  headedShots: "Headed shots",
  throughBalls: "Through balls",
  successfulDribbles: "Successful dribbles",
  offsides: "Offsides",
  foulsConceded: "Fouls conceded",
  foulsWon: "Fouls won",
  yellowCards: "Yellow cards",
  redCards: "Red cards",
  tackles: "Tackles",
  tacklesSuccessRate: "Tackles success rate",
  interceptions: "Interceptions",
  clearances: "Clearances",
  duels: "Duels",
  duelsSuccessRate: "Duels success rate",
  aerialDuels: "Aerial duels",
  aerialDuelsWon: "Aerial duels won",
  recoveries: "Recoveries",
  recoveriesAttackingHalfPct: "Recoveries in attacking half (%)",
  possessionLostDefensiveHalf: "Possession lost in defensive half",
  possessionLostMiddleThird: "Possession lost in middle third",
  attackingThirdRecovery: "Attacking third recovery",
  defensiveThirdRecovery: "Defensive third recovery",
  midfieldThirdRecovery: "Midfield third recovery",
  passes: "Passes",
  passingAccuracy: "Passing accuracy",
  forwardPassesPct: "Forward passes (%)",
  longPassesPct: "Long passes proportion (%)",
  passesOpponentsHalf: "Passes in opponents' half",
  passingAccuracyOpponentsHalf: "Passing accuracy in opponents' half (%)",
  passingAccuracyFinalThird: "Passing accuracy in final third (%)",
  totalPassesFinalThird: "Total passes in the final third",
} as const;

export type OptaStatLabel = (typeof OPTA_STAT)[keyof typeof OPTA_STAT];

export interface OptaStatPair {
  home: number | null;
  away: number | null;
}

export interface OptaTeamWidgetStats {
  possessionPct: number | null;
  shots: number | null;
  shotsOnTarget: number | null;
  shotsInsideBox: number | null;
  shotsOutsideBox: number | null;
  blockedShots: number | null;
  cornersWon: number | null;
  cornerAwarded: number | null;
  crosses: number | null;
  openPlayCrosses: number | null;
  finalThirdEntries: number | null;
  penaltyAreaEntries: number | null;
  keyPasses: number | null;
  foulsConceded: number | null;
  foulsWon: number | null;
  yellowCards: number | null;
  redCards: number | null;
  tackles: number | null;
  interceptions: number | null;
  clearances: number | null;
  duels: number | null;
  duelsSuccessRatePct: number | null;
  aerialDuels: number | null;
  successfulDribbles: number | null;
  recoveries: number | null;
  possessionLostDefensiveHalf: number | null;
  possessionLostMiddleThird: number | null;
  passes: number | null;
  passingAccuracyPct: number | null;
  offsides: number | null;
}

export interface OptaWidgetMatchStats {
  home: OptaTeamWidgetStats;
  away: OptaTeamWidgetStats;
  /** Every unique stat label from the widget (first occurrence per label). */
  raw: Record<string, OptaStatPair>;
  labelCount: number;
}

function isPercentLabel(label: string): boolean {
  const lower = label.toLowerCase();
  return (
    lower.includes("%") ||
    lower.includes("accuracy") ||
    lower.includes("rate") ||
    lower.includes("proportion")
  );
}

export function parseOptaStatValue(label: string, raw: string | null): number | null {
  if (raw == null || raw.trim() === "") return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (isPercentLabel(label)) {
    const n = Number(cleaned.replace("%", ""));
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Extract all Opta-Stats-Bars rows from the full match-centre widget HTML. */
export function extractAllOptaStatBarRows(
  widgetHtml: string
): Map<string, { home: string | null; away: string | null }> {
  const rows = new Map<string, { home: string | null; away: string | null }>();
  const pattern =
    /<th[^>]*scope="row"[^>]*>([^<]+)<\/th><\/tr>\s*<tr[^>]*><td class="Opta-Outer[^"]*">([^<]*)<\/td>[\s\S]*?<td class="Opta-Outer[^"]*">([^<]*)<\/td>/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(widgetHtml)) !== null) {
    const label = match[1].trim();
    if (!rows.has(label)) {
      rows.set(label, { home: match[2].trim(), away: match[3].trim() });
    }
  }
  return rows;
}

function readPair(
  rows: Map<string, { home: string | null; away: string | null }>,
  label: string
): OptaStatPair {
  const row = rows.get(label);
  return {
    home: parseOptaStatValue(label, row?.home ?? null),
    away: parseOptaStatValue(label, row?.away ?? null),
  };
}

function buildTeamSide(
  rows: Map<string, { home: string | null; away: string | null }>,
  side: "home" | "away"
): OptaTeamWidgetStats {
  const pick = (label: string): number | null => readPair(rows, label)[side];

  return {
    possessionPct: pick(OPTA_STAT.possession),
    shots: pick(OPTA_STAT.shots),
    shotsOnTarget: pick(OPTA_STAT.shotsOnTarget),
    shotsInsideBox: pick(OPTA_STAT.shotsInsideBox),
    shotsOutsideBox: pick(OPTA_STAT.shotsOutsideBox),
    blockedShots: pick(OPTA_STAT.blockedShots),
    cornersWon: pick(OPTA_STAT.cornersWon),
    cornerAwarded: pick(OPTA_STAT.cornerAwarded),
    crosses: pick(OPTA_STAT.crosses),
    openPlayCrosses: pick(OPTA_STAT.openPlayCrosses),
    finalThirdEntries: pick(OPTA_STAT.finalThirdEntries),
    penaltyAreaEntries: pick(OPTA_STAT.penaltyAreaEntries),
    keyPasses: pick(OPTA_STAT.keyPasses),
    foulsConceded: pick(OPTA_STAT.foulsConceded),
    foulsWon: pick(OPTA_STAT.foulsWon),
    yellowCards: pick(OPTA_STAT.yellowCards),
    redCards: pick(OPTA_STAT.redCards),
    tackles: pick(OPTA_STAT.tackles),
    interceptions: pick(OPTA_STAT.interceptions),
    clearances: pick(OPTA_STAT.clearances),
    duels: pick(OPTA_STAT.duels),
    duelsSuccessRatePct: pick(OPTA_STAT.duelsSuccessRate),
    aerialDuels: pick(OPTA_STAT.aerialDuels),
    successfulDribbles: pick(OPTA_STAT.successfulDribbles),
    recoveries: pick(OPTA_STAT.recoveries),
    possessionLostDefensiveHalf: pick(OPTA_STAT.possessionLostDefensiveHalf),
    possessionLostMiddleThird: pick(OPTA_STAT.possessionLostMiddleThird),
    passes: pick(OPTA_STAT.passes),
    passingAccuracyPct: pick(OPTA_STAT.passingAccuracy),
    offsides: pick(OPTA_STAT.offsides),
  };
}

export function extractOptaWidgetMatchStats(widgetHtml: string): OptaWidgetMatchStats | null {
  if (!widgetHtml.trim()) return null;

  const rows = extractAllOptaStatBarRows(widgetHtml);
  if (rows.size === 0) return null;

  const raw: Record<string, OptaStatPair> = {};
  for (const [label, values] of rows) {
    raw[label] = {
      home: parseOptaStatValue(label, values.home),
      away: parseOptaStatValue(label, values.away),
    };
  }

  return {
    home: buildTeamSide(rows, "home"),
    away: buildTeamSide(rows, "away"),
    raw,
    labelCount: rows.size,
  };
}

/** Per-team style indices derived from observed WC widget stats (1.0 = tournament average). */
export interface WcTeamStyleProfile {
  teamApiId: number;
  games: number;
  cornersPerGame: number;
  foulsPerGame: number;
  yellowPerGame: number;
  redPerGame: number;
  shotsOnTargetPerGame: number;
  crossesPerGame: number;
  finalThirdEntriesPerGame: number;
  tacklesPerGame: number;
  possessionPct: number;
  widePlayIndex: number;
  physicalityIndex: number;
  pressIntensityIndex: number;
}

function safeAvg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function indexRatio(value: number, baseline: number, floor = 0.72, cap = 1.38): number {
  if (baseline <= 0) return 1;
  return Math.max(floor, Math.min(cap, value / baseline));
}

export function buildWcTeamStyleProfile(input: {
  teamApiId: number;
  games: number;
  corners: number;
  fouls: number;
  yellow: number;
  red: number;
  shotsOnTarget: number;
  crosses: number;
  finalThirdEntries: number;
  tackles: number;
  interceptions: number;
  recoveries: number;
  duels: number;
  aerialDuels: number;
  possessionPct: number;
  tournamentBaselines: WcTournamentStyleBaselines;
}): WcTeamStyleProfile {
  const g = Math.max(1, input.games);
  const cornersPerGame = input.corners / g;
  const foulsPerGame = input.fouls / g;
  const crossesPerGame = input.crosses / g;
  const finalThirdEntriesPerGame = input.finalThirdEntries / g;
  const tacklesPerGame = input.tackles / g;
  const pressRaw =
    (input.interceptions + input.recoveries) / g +
    0.04 * (input.duels / g);
  const physicalRaw =
    foulsPerGame +
    0.12 * (input.tackles / g) +
    0.06 * (input.duels / g) +
    0.08 * (input.aerialDuels / g);
  const wideRaw =
    cornersPerGame + 0.35 * crossesPerGame + 0.08 * finalThirdEntriesPerGame;

  const b = input.tournamentBaselines;

  return {
    teamApiId: input.teamApiId,
    games: input.games,
    cornersPerGame,
    foulsPerGame,
    yellowPerGame: input.yellow / g,
    redPerGame: input.red / g,
    shotsOnTargetPerGame: input.shotsOnTarget / g,
    crossesPerGame,
    finalThirdEntriesPerGame,
    tacklesPerGame,
    possessionPct: input.possessionPct / g,
    widePlayIndex: indexRatio(wideRaw, b.widePlayPerTeam),
    physicalityIndex: indexRatio(physicalRaw, b.physicalityPerTeam),
    pressIntensityIndex: indexRatio(pressRaw, b.pressPerTeam),
  };
}

export interface WcTournamentStyleBaselines {
  widePlayPerTeam: number;
  physicalityPerTeam: number;
  pressPerTeam: number;
  possessionPct: number;
}

export function computeTournamentStyleBaselines(
  teamSamples: Array<{
    corners: number;
    fouls: number;
    crosses: number;
    finalThirdEntries: number;
    tackles: number;
    interceptions: number;
    recoveries: number;
    duels: number;
    aerialDuels: number;
    possessionPct: number;
  }>
): WcTournamentStyleBaselines {
  if (!teamSamples.length) {
    return {
      widePlayPerTeam: 6.5,
      physicalityPerTeam: 14,
      pressPerTeam: 18,
      possessionPct: 50,
    };
  }

  const wideValues = teamSamples.map(
    (s) => s.corners + 0.35 * s.crosses + 0.08 * s.finalThirdEntries
  );
  const physicalValues = teamSamples.map(
    (s) => s.fouls + 0.12 * s.tackles + 0.06 * s.duels + 0.08 * s.aerialDuels
  );
  const pressValues = teamSamples.map(
    (s) => s.interceptions + s.recoveries + 0.04 * s.duels
  );

  return {
    widePlayPerTeam: safeAvg(wideValues),
    physicalityPerTeam: safeAvg(physicalValues),
    pressPerTeam: safeAvg(pressValues),
    possessionPct: safeAvg(teamSamples.map((s) => s.possessionPct)),
  };
}

export function accumulateTeamWidgetSample(
  acc: {
    corners: number;
    fouls: number;
    yellow: number;
    red: number;
    shotsOnTarget: number;
    crosses: number;
    finalThirdEntries: number;
    tackles: number;
    interceptions: number;
    recoveries: number;
    duels: number;
    aerialDuels: number;
    possessionPct: number;
    games: number;
  },
  team: OptaTeamWidgetStats
): void {
  acc.corners += team.cornersWon ?? 0;
  acc.fouls += team.foulsConceded ?? 0;
  acc.yellow += team.yellowCards ?? 0;
  acc.red += team.redCards ?? 0;
  acc.shotsOnTarget += team.shotsOnTarget ?? 0;
  acc.crosses += team.crosses ?? 0;
  acc.finalThirdEntries += team.finalThirdEntries ?? 0;
  acc.tackles += team.tackles ?? 0;
  acc.interceptions += team.interceptions ?? 0;
  acc.recoveries += team.recoveries ?? 0;
  acc.duels += team.duels ?? 0;
  acc.aerialDuels += team.aerialDuels ?? 0;
  acc.possessionPct += team.possessionPct ?? 0;
  acc.games += 1;
}
