/**
 * Season-scoped League xG hub payload (standings Pos + match / Understat xG).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import type { GlpmXgHubPayload } from "@/lib/glpm/hub-types";
import {
  loadGlpmHubCatalog,
  type GlpmHubCatalog,
} from "@/lib/glpm/hub-catalog";
import { pickDefaultGlpmSeasonId } from "@/lib/glpm/season-ready";
import { buildSeasonStandingsFromMatches } from "@/lib/glpm/build-season-standings";
import { chunkIds } from "@/lib/sportmonks/constants";
import {
  buildXgTableRows,
  leagueIsMostlyProxy,
  type SeasonXgAgg,
} from "@/lib/glpm/xg-table";
import {
  loadUnderstatSeasonXgRows,
  medianPlayed,
  shouldPreferUnderstatSeasonXg,
  understatRowsToSeasonXgAgg,
} from "@/lib/glpm/understat-season-xg";

type Client = SupabaseClient<Database>;

export type LoadGlpmXgHubPayloadOpts = {
  seasonId?: number | null;
  competitionId?: number | null;
  catalog?: GlpmHubCatalog;
};

type MatchTeamStatRow = {
  match_sm_id: number;
  team_sm_id: number;
  xg: number | null;
  xg_conceded: number | null;
  xg_source: string | null;
  payload: unknown;
};

type TeamMatchXg = {
  xgf: number;
  xga: number | null;
  isProxy: boolean;
};

function isProxyRow(row: MatchTeamStatRow): boolean {
  if (row.xg_source === "sportmonks" || row.xg_source === "understat") {
    return false;
  }
  if (!row.payload || typeof row.payload !== "object") {
    // No source and no payload flag → treat as proxy only when xg present without provenance
    return true;
  }
  const payload = row.payload as { xg_proxy?: boolean };
  if (typeof payload.xg_proxy === "boolean") return payload.xg_proxy;
  return row.xg_source == null;
}

/** Sum season xGF / xGA from match team stats. Prefers provider rows per team. */
export async function loadSeasonXgAggregates(
  client: Client,
  seasonId: number
): Promise<Map<number, SeasonXgAgg>> {
  const { data: finished } = await client
    .from("glpm_matches")
    .select("sm_id")
    .eq("season_id", seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null)
    .limit(800);

  const matchIds = (finished ?? []).map((m) => m.sm_id).filter(Number.isFinite);
  const byTeam = new Map<number, SeasonXgAgg>();
  if (!matchIds.length) return byTeam;

  const stats: MatchTeamStatRow[] = [];
  for (const chunk of chunkIds(matchIds, 100)) {
    const { data } = await client
      .from("glpm_match_team_stats")
      .select("match_sm_id,team_sm_id,xg,xg_conceded,xg_source,payload")
      .in("match_sm_id", chunk);
    for (const row of data ?? []) stats.push(row as MatchTeamStatRow);
  }

  const byMatch = new Map<number, MatchTeamStatRow[]>();
  for (const row of stats) {
    const list = byMatch.get(row.match_sm_id) ?? [];
    list.push(row);
    byMatch.set(row.match_sm_id, list);
  }

  /** Per-team list of per-match contributions (before provider preference). */
  const teamMatches = new Map<number, TeamMatchXg[]>();

  function pushTeam(teamSmId: number, entry: TeamMatchXg) {
    const list = teamMatches.get(teamSmId) ?? [];
    list.push(entry);
    teamMatches.set(teamSmId, list);
  }

  for (const [, rows] of byMatch) {
    if (rows.length < 2) {
      for (const row of rows) {
        const xgf = row.xg != null ? Number(row.xg) : null;
        if (xgf == null || !Number.isFinite(xgf)) continue;
        const xga =
          row.xg_conceded != null && Number.isFinite(Number(row.xg_conceded))
            ? Number(row.xg_conceded)
            : null;
        pushTeam(row.team_sm_id, {
          xgf,
          xga,
          isProxy: isProxyRow(row),
        });
      }
      continue;
    }

    const a = rows[0]!;
    const b = rows[1]!;
    const pair: Array<[MatchTeamStatRow, MatchTeamStatRow]> = [
      [a, b],
      [b, a],
    ];
    for (const [self, opp] of pair) {
      const xgf = self.xg != null ? Number(self.xg) : null;
      if (xgf == null || !Number.isFinite(xgf)) continue;
      const conceded =
        self.xg_conceded != null ? Number(self.xg_conceded) : null;
      const oppXg = opp.xg != null ? Number(opp.xg) : null;
      const xga =
        conceded != null && Number.isFinite(conceded)
          ? conceded
          : oppXg != null && Number.isFinite(oppXg)
            ? oppXg
            : null;
      pushTeam(self.team_sm_id, {
        xgf,
        xga,
        isProxy: isProxyRow(self),
      });
    }
  }

  for (const [teamSmId, matches] of teamMatches) {
    const provider = matches.filter((m) => !m.isProxy);
    const use = provider.length > 0 ? provider : matches;
    let xgf = 0;
    let xga = 0;
    let providerN = 0;
    let proxyN = 0;
    for (const m of use) {
      xgf += m.xgf;
      if (m.xga != null) xga += m.xga;
      if (m.isProxy) proxyN += 1;
      else providerN += 1;
    }
    byTeam.set(teamSmId, { teamSmId, xgf, xga, providerN, proxyN });
  }

  return byTeam;
}

export async function loadGlpmXgHubPayload(
  client: Client,
  opts: LoadGlpmXgHubPayloadOpts = {}
): Promise<GlpmXgHubPayload> {
  const updatedAt = new Date().toISOString();
  const catalog = opts.catalog ?? (await loadGlpmHubCatalog(client));
  const { seasonList, readiness, competitionList, seasonsForPayload } = catalog;

  let seasonId = opts.seasonId ?? null;
  let competitionId = opts.competitionId ?? null;

  if (seasonId == null && seasonList.length > 0) {
    seasonId = pickDefaultGlpmSeasonId(seasonList, readiness, competitionId);
    if (seasonId == null && competitionId != null) {
      seasonId = pickDefaultGlpmSeasonId(seasonList, readiness, null);
    }
  }

  const seasonMeta =
    seasonId != null ? seasonList.find((s) => s.smId === seasonId) ?? null : null;
  if (competitionId == null && seasonMeta) {
    competitionId = seasonMeta.competitionId;
  }
  const competitionMeta =
    competitionId != null
      ? competitionList.find((c) => c.smId === competitionId) ?? null
      : null;

  if (seasonId == null) {
    return {
      competition: competitionMeta,
      season: null,
      competitions: competitionList,
      seasons: seasonsForPayload,
      xgTable: [],
      mostlyProxyXg: false,
      updatedAt,
    };
  }

  const standingsBuild = await buildSeasonStandingsFromMatches(client, seasonId);
  const standingInputs = standingsBuild.rows.map((r) => ({
    teamSmId: r.teamSmId,
    teamName: r.teamName,
    played: r.played,
    goalsFor: r.goalsFor,
    goalsAgainst: r.goalsAgainst,
    rank: r.rank,
  }));

  const matchXg = await loadSeasonXgAggregates(client, seasonId);
  const understatRows = loadUnderstatSeasonXgRows(seasonId);
  const preferUnderstat = shouldPreferUnderstatSeasonXg(
    understatRows,
    medianPlayed(standingInputs.map((s) => s.played))
  );

  // Prefer provider match aggregates when the season has real SM xG; else Understat
  // when deep enough; else fall back to whatever match stats we have (may be proxy).
  let xgByTeam = matchXg;
  const providerTeams = [...matchXg.values()].filter((a) => a.providerN > 0).length;
  const totalTeamsWithXg = [...matchXg.values()].filter(
    (a) => a.providerN + a.proxyN > 0
  ).length;
  const matchProviderShare =
    totalTeamsWithXg > 0 ? providerTeams / totalTeamsWithXg : 0;

  if (preferUnderstat && matchProviderShare < 0.5) {
    xgByTeam = understatRowsToSeasonXgAgg(understatRows);
  }

  const xgTable = buildXgTableRows(standingInputs, xgByTeam);

  return {
    competition: competitionMeta,
    season: { smId: seasonId, name: seasonMeta?.name ?? null },
    competitions: competitionList,
    seasons: seasonsForPayload,
    xgTable,
    // Understat / provider aggregates set providerN; proxy-only seasons still warn.
    mostlyProxyXg: leagueIsMostlyProxy(xgTable),
    updatedAt,
  };
}
