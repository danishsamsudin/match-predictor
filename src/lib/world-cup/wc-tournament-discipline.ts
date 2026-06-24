import {
  DEFAULT_TOURNAMENT_DISCIPLINE_RULES,
  type TournamentDisciplineRules,
  type TournamentRound,
} from "@/lib/config/tournament-rules";
import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { disciplineCardCount } from "@/lib/world-cup/wc-tournament-composites";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import type { WcMatchRow } from "@/lib/world-cup/standings";
import type { SupabaseClient } from "@supabase/supabase-js";

export type WcPlayerMatchDiscipline = {
  matchId: string;
  matchDate: string;
  round: TournamentRound;
  playerName: string;
  optaPlayerId: string;
  yellows: number;
  reds: number;
};

function normalizeDisciplineName(name: string): string {
  return normalizeNationalTeamName(name)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function wcPlayerNamesMatch(a: string, b: string): boolean {
  const na = normalizeDisciplineName(a);
  const nb = normalizeDisciplineName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const lastA = na.split(" ").pop() ?? "";
  const lastB = nb.split(" ").pop() ?? "";
  return lastA.length >= 2 && lastA === lastB;
}

export function isPlayerNameSuspended(
  playerName: string,
  suspendedNames: ReadonlySet<string>
): boolean {
  for (const suspended of suspendedNames) {
    if (wcPlayerNamesMatch(playerName, suspended)) return true;
  }
  return false;
}

export function resolveWcMatchRound(match: WcMatchRow): TournamentRound {
  const round = (match.round ?? "").toUpperCase();
  if (round === "R32" || round === "R16" || round === "QF" || round === "SF" || round === "F") {
    return round;
  }
  if (round === "3P") return "3P";
  if (match.group_code) return "GS";
  return "GS";
}

function teamPlayedMatch(match: WcMatchRow, teamApiId: number): boolean {
  const homeApi = resolveApiTeamId(match.home_team_id ?? "", match.home_team_name ?? "");
  const awayApi = resolveApiTeamId(match.away_team_id ?? "", match.away_team_name ?? "");
  return homeApi === teamApiId || awayApi === teamApiId;
}

function isFinishedWcMatch(match: WcMatchRow): boolean {
  const status = (match.status ?? "").toLowerCase();
  if (status === "finished" || status === "completed" || status === "ft") return true;
  return match.home_goals != null && match.away_goals != null;
}

/** Finished WC matches for a team strictly before an upcoming kickoff date. */
export function priorFinishedWcMatchesForTeam(
  finishedMatches: WcMatchRow[],
  teamApiId: number,
  beforeDate?: string | null
): WcMatchRow[] {
  const cutoff = beforeDate?.trim().slice(0, 10) ?? null;
  return finishedMatches
    .filter((m) => isFinishedWcMatch(m) && teamPlayedMatch(m, teamApiId))
    .filter((m) => {
      if (!cutoff || !m.date) return true;
      return m.date.slice(0, 10) < cutoff;
    })
    .sort((a, b) => {
      const da = a.date?.slice(0, 10) ?? "";
      const db = b.date?.slice(0, 10) ?? "";
      if (da !== db) return da.localeCompare(db);
      return a.id.localeCompare(b.id);
    });
}

function isLastMatchInRound(
  matches: WcMatchRow[],
  index: number,
  round: TournamentRound
): boolean {
  for (let i = index + 1; i < matches.length; i++) {
    if (resolveWcMatchRound(matches[i]) === round) return false;
  }
  return true;
}

/** Pure suspension simulation from Opta per-match player card rows. */
export function computeWcSuspendedPlayerNames(input: {
  priorMatches: WcMatchRow[];
  disciplineHistory: WcPlayerMatchDiscipline[];
  rules?: TournamentDisciplineRules;
}): Set<string> {
  const rules = input.rules ?? DEFAULT_TOURNAMENT_DISCIPLINE_RULES;
  const priorMatches = [...input.priorMatches].sort((a, b) => {
    const da = a.date?.slice(0, 10) ?? "";
    const db = b.date?.slice(0, 10) ?? "";
    if (da !== db) return da.localeCompare(db);
    return a.id.localeCompare(b.id);
  });
  if (!priorMatches.length) return new Set();

  const rowsByMatch = new Map<string, WcPlayerMatchDiscipline[]>();
  for (const row of input.disciplineHistory) {
    const list = rowsByMatch.get(row.matchId) ?? [];
    list.push(row);
    rowsByMatch.set(row.matchId, list);
  }

  let nextMatchBans = new Set<string>();
  const yellowCount = new Map<string, number>();

  for (let matchIndex = 0; matchIndex < priorMatches.length; matchIndex++) {
    const match = priorMatches[matchIndex]!;
    const round = resolveWcMatchRound(match);
    const rows = rowsByMatch.get(match.id) ?? [];
    const servingBan = nextMatchBans;
    nextMatchBans = new Set<string>();

    for (const playerKey of servingBan) {
      yellowCount.delete(playerKey);
    }

    for (const row of rows) {
      const playerKey = normalizeDisciplineName(row.playerName);
      if (!playerKey || servingBan.has(playerKey)) continue;

      const yellows = Math.max(0, row.yellows);
      const reds = Math.max(0, row.reds);

      if (yellows > 0 && reds === 0) {
        const next = (yellowCount.get(playerKey) ?? 0) + yellows;
        if (next >= rules.yellowsPerSuspension) {
          yellowCount.delete(playerKey);
          nextMatchBans.add(playerKey);
        } else {
          yellowCount.set(playerKey, next);
        }
      }

      if (reds > 0) {
        yellowCount.delete(playerKey);
        nextMatchBans.add(playerKey);
      }
    }

    if (
      rules.amnestyAfterRound &&
      round === rules.amnestyAfterRound &&
      isLastMatchInRound(priorMatches, matchIndex, round)
    ) {
      yellowCount.clear();
    }
  }

  const displayNames = new Set<string>();
  for (const key of nextMatchBans) {
    const row = input.disciplineHistory.find(
      (e) => normalizeDisciplineName(e.playerName) === key
    );
    displayNames.add(row?.playerName ?? key);
  }
  return displayNames;
}

export async function loadWcDisciplineHistoryForTeam(
  supabase: SupabaseClient,
  teamApiId: number,
  priorMatches: WcMatchRow[]
): Promise<WcPlayerMatchDiscipline[]> {
  if (!priorMatches.length) return [];

  const matchMeta = new Map(
    priorMatches.map((m) => [
      m.id,
      { date: m.date?.slice(0, 10) ?? "1970-01-01", round: resolveWcMatchRound(m) },
    ])
  );
  const matchIds = priorMatches.map((m) => m.id);

  const { data, error } = await supabase
    .from("world_cup_player_match_stats")
    .select("match_id, player_name, opta_player_id, stats")
    .eq("team_api_id", teamApiId)
    .in("match_id", matchIds);

  if (error || !data?.length) return [];

  const rows: WcPlayerMatchDiscipline[] = [];
  for (const row of data) {
    const meta = matchMeta.get(String(row.match_id));
    if (!meta) continue;
    const stats = (row.stats ?? {}) as Record<string, number | string | boolean | null>;
    const yellows = disciplineCardCount(stats, "yellow");
    const reds = disciplineCardCount(stats, "red");
    if (yellows === 0 && reds === 0) continue;
    rows.push({
      matchId: String(row.match_id),
      matchDate: meta.date,
      round: meta.round,
      playerName: String(row.player_name),
      optaPlayerId: String(row.opta_player_id),
      yellows,
      reds,
    });
  }
  return rows;
}

export async function loadWcSuspendedPlayerNamesForTeam(input: {
  supabase: SupabaseClient;
  teamApiId: number;
  finishedMatches: WcMatchRow[];
  beforeDate?: string | null;
  rules?: TournamentDisciplineRules;
}): Promise<Set<string>> {
  const prior = priorFinishedWcMatchesForTeam(
    input.finishedMatches,
    input.teamApiId,
    input.beforeDate
  );
  const history = await loadWcDisciplineHistoryForTeam(
    input.supabase,
    input.teamApiId,
    prior
  );
  return computeWcSuspendedPlayerNames({
    priorMatches: prior,
    disciplineHistory: history,
    rules: input.rules,
  });
}
