import { normalizeNationalTeamName } from "@/lib/data/world-cup-2026-teams";
import { resolveApiTeamId } from "@/lib/world-cup/resolve-api-team-id";
import { buildR16HubMatchRows } from "@/lib/world-cup/r16-hub-fixtures";
import { buildQfHubMatchRows } from "@/lib/world-cup/qf-hub-fixtures";
import {
  buildR32HubMatchRows,
  isKnockoutSlotPlaceholder,
} from "@/lib/world-cup/r32-hub-fixtures";
import type { WcMatchRow } from "@/lib/world-cup/standings";

function shiftIsoDate(isoDate: string, dayDelta: number): string {
  const d = new Date(`${isoDate.slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dayDelta);
  return d.toISOString().slice(0, 10);
}

function candidateKnockoutDates(matchDate: string): string[] {
  const base = matchDate.slice(0, 10);
  return [...new Set([base, shiftIsoDate(base, -1), shiftIsoDate(base, 1)])];
}

export type KnockoutHubMatchRow = WcMatchRow & {
  home_team_name: string;
  away_team_name: string;
};

function teamPairMatchesFixture(
  fx: KnockoutHubMatchRow,
  homeApiId: number,
  awayApiId: number
): boolean {
  if (!fx.home_team_id || !fx.away_team_id) return false;
  const fxHome = resolveApiTeamId(fx.home_team_id, fx.home_team_name);
  const fxAway = resolveApiTeamId(fx.away_team_id, fx.away_team_name);
  return (
    (fxHome === homeApiId && fxAway === awayApiId) ||
    (fxHome === awayApiId && fxAway === homeApiId)
  );
}

/** Synthetic R32/R16 hub row when this team pairing has a confirmed knockout fixture on the date. */
export function findKnockoutHubMatchForTeamPair(input: {
  teamNames: Map<string, string>;
  homeTeamApiId: number;
  awayTeamApiId: number;
  matchDate: string;
}): KnockoutHubMatchRow | null {
  if (input.homeTeamApiId <= 0 || input.awayTeamApiId <= 0) return null;

  const dates = new Set(candidateKnockoutDates(input.matchDate));
  const candidates = [
    ...buildR32HubMatchRows(input.teamNames),
    ...buildR16HubMatchRows(input.teamNames),
    ...buildQfHubMatchRows(input.teamNames),
  ];

  for (const fx of candidates) {
    if (!fx.date || !dates.has(fx.date.slice(0, 10))) continue;
    if (
      isKnockoutSlotPlaceholder(fx.home_team_name) ||
      isKnockoutSlotPlaceholder(fx.away_team_name)
    ) {
      continue;
    }
    if (!teamPairMatchesFixture(fx, input.homeTeamApiId, input.awayTeamApiId)) continue;
    return fx;
  }

  return null;
}

export function teamsSwappedInInputVsKnockoutFixture(
  fx: KnockoutHubMatchRow,
  requestHomeApiId: number
): boolean {
  const fxHome = resolveApiTeamId(fx.home_team_id!, fx.home_team_name);
  return fxHome !== requestHomeApiId;
}

export function teamPairPredictionKey(homeApiId: number, awayApiId: number): string | null {
  if (homeApiId <= 0 || awayApiId <= 0) return null;
  const lo = Math.min(homeApiId, awayApiId);
  const hi = Math.max(homeApiId, awayApiId);
  return `${lo}:${hi}`;
}

export function buildPredictionTeamPairIndex(
  predByMatch: Map<string, Record<string, unknown>>
): Map<string, Record<string, unknown>> {
  const index = new Map<string, Record<string, unknown>>();

  for (const [matchId, row] of predByMatch) {
    const snap = (row.snapshot ?? {}) as Record<string, unknown>;
    const homeApi = Number(snap.home_team_api_id);
    const awayApi = Number(snap.away_team_api_id);
    const key = teamPairPredictionKey(homeApi, awayApi);
    if (!key) continue;

    const existing = index.get(key);
    const existingId = existing ? String(existing.match_id ?? "") : "";
    const preferNew =
      !existing ||
      (matchId.startsWith("wc2026-ko-") && !existingId.startsWith("wc2026-ko-"));
    if (preferNew) {
      index.set(key, { ...row, match_id: matchId });
    }
  }

  return index;
}

export function resolveHubMatchPredictionRaw(
  match: {
    id: string;
    home_team_id?: string | null;
    away_team_id?: string | null;
    home_team_name?: string;
    away_team_name?: string;
  },
  predByMatch: Map<string, Record<string, unknown>>,
  pairIndex: Map<string, Record<string, unknown>>
): Record<string, unknown> | null {
  const direct = predByMatch.get(match.id);
  if (direct) return direct;

  if (!match.home_team_id || !match.away_team_id) return null;
  const homeApi = resolveApiTeamId(match.home_team_id, match.home_team_name ?? "");
  const awayApi = resolveApiTeamId(match.away_team_id, match.away_team_name ?? "");
  const key = teamPairPredictionKey(homeApi, awayApi);
  if (!key) return null;
  return pairIndex.get(key) ?? null;
}

export function normalizeTeamNameKey(name: string): string {
  return normalizeNationalTeamName(name).toLowerCase();
}
