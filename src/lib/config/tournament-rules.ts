/** Knockout / group phase label for discipline amnesty boundaries. */
export type TournamentRound = "GS" | "R32" | "R16" | "QF" | "SF" | "3P" | "F";

export type TournamentDisciplineRules = {
  uniqueTournamentId: number;
  /** Yellow cards across matches before a one-match ban (FIFA default: 2). */
  yellowsPerSuspension: number;
  /** Match bans served after a straight red (FIFA default: 1). */
  redCardMatchBan: number;
  /** After this round completes, accumulated yellows are wiped (WC/Euro: QF). */
  amnestyAfterRound?: TournamentRound;
};

export const DEFAULT_TOURNAMENT_DISCIPLINE_RULES: TournamentDisciplineRules = {
  uniqueTournamentId: 0,
  yellowsPerSuspension: 2,
  redCardMatchBan: 1,
};

/** Sofascore uniqueTournamentId → discipline rules (see sportapi-leagues.ts). */
export const TOURNAMENT_DISCIPLINE_RULES: Record<number, TournamentDisciplineRules> = {
  16: {
    uniqueTournamentId: 16,
    yellowsPerSuspension: 2,
    redCardMatchBan: 1,
    amnestyAfterRound: "QF",
  },
  1: {
    uniqueTournamentId: 1,
    yellowsPerSuspension: 2,
    redCardMatchBan: 1,
    amnestyAfterRound: "QF",
  },
  133: {
    uniqueTournamentId: 133,
    yellowsPerSuspension: 2,
    redCardMatchBan: 1,
    amnestyAfterRound: "QF",
  },
};

export function resolveTournamentDisciplineRules(
  competitionId: number | null | undefined
): TournamentDisciplineRules {
  if (competitionId == null) return DEFAULT_TOURNAMENT_DISCIPLINE_RULES;
  return TOURNAMENT_DISCIPLINE_RULES[competitionId] ?? DEFAULT_TOURNAMENT_DISCIPLINE_RULES;
}

const ROUND_ORDER: TournamentRound[] = ["GS", "R32", "R16", "QF", "SF", "3P", "F"];

export function tournamentRoundIndex(round: TournamentRound): number {
  const idx = ROUND_ORDER.indexOf(round);
  return idx >= 0 ? idx : 0;
}
