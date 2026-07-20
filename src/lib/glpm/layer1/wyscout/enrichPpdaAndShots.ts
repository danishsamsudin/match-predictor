import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../supabase";
import type { WyscoutClient } from "../../../wyscout/client";
import type {
  WyscoutMatchAdvancedStatsPayload,
  WyscoutMatchEventsPayload,
  WyscoutTeamAdvancedStatsSide,
} from "../../../wyscout/types";
import { listAdvancedStatsSides } from "../upsertMatchTeamStats";
import { extractShotsFromEvents, mapWyscoutEventRow } from "../extractShots";
import { upsertProviderPayload } from "../upsertPayload";
import {
  inferGkByTeamFromEvents,
  loadPlayerSmIdByWyId,
  upsertMatchPlayerGkStats,
} from "../upsertMatchPlayerStats";
import { buildAndUpsertMatchTeamFeatures } from "../../layer2/buildMatchTeamFeatures";
import { buildAndUpsertMatchPlayerGkFeatures } from "../../layer2/buildMatchPlayerGkFeatures";
import { validateAndPersistMatchBundle } from "../../validation/validateMatchBundle";
import type { ValidationIssue } from "../../validation/rules";

type Client = SupabaseClient<Database>;

export type EnrichResult = {
  matchSmId: number;
  wyscoutMatchId: number;
  ppdaUpdated: boolean;
  xgFilled: boolean;
  psxgFilled: boolean;
  shotCount: number;
  issues: ValidationIssue[];
};

async function resolveWyscoutMatchId(
  supabase: Client,
  matchSmId: number,
  explicitWyId?: number
): Promise<number> {
  if (explicitWyId != null) return explicitWyId;
  const { data, error } = await supabase
    .from("glpm_provider_entity_map")
    .select("provider_entity_id")
    .eq("entity_type", "match")
    .eq("sm_id", matchSmId)
    .eq("provider", "wyscout")
    .maybeSingle();
  if (error) throw new Error(`lookup wyscout match map failed: ${error.message}`);
  if (!data) {
    throw new Error(
      `No Wyscout mapping for match sm_id=${matchSmId}. Insert glpm_provider_entity_map row first.`
    );
  }
  return data.provider_entity_id;
}

async function loadTeamWyMap(
  supabase: Client,
  homeSm: number,
  awaySm: number
): Promise<Map<number, number>> {
  const { data, error } = await supabase
    .from("glpm_provider_entity_map")
    .select("sm_id, provider_entity_id")
    .eq("entity_type", "team")
    .eq("provider", "wyscout")
    .in("sm_id", [homeSm, awaySm]);
  if (error) throw new Error(`lookup team map failed: ${error.message}`);
  const map = new Map<number, number>();
  for (const row of data ?? []) {
    map.set(row.provider_entity_id, row.sm_id);
  }
  return map;
}

function asNumber(v: unknown): number | null {
  if (v == null) return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function ppdaFromSide(side: WyscoutTeamAdvancedStatsSide): number | null {
  return asNumber(side.total?.ppda);
}

function xgFromSide(side: WyscoutTeamAdvancedStatsSide): number | null {
  return asNumber(side.total?.xgShot);
}

function psxgFacedFromSide(side: WyscoutTeamAdvancedStatsSide): number | null {
  const total = (side.total ?? {}) as Record<string, unknown>;
  return (
    asNumber(total.postShotXgAgainst) ??
    asNumber(total.xCG) ??
    asNumber(total.psxgFaced) ??
    null
  );
}

/**
 * Secondary enrich: overlay Wyscout PPDA / pitch events / missing xG·PSxG onto SM-canonical rows.
 * Never overwrites SportMonks xG/psxg when already present.
 */
export async function enrichMatchFromWyscoutPayloads(
  supabase: Client,
  args: {
    matchSmId: number;
    wyscoutMatchId: number;
    advancedStats: WyscoutMatchAdvancedStatsPayload;
    events: WyscoutMatchEventsPayload;
    teamSmIdByWyId: Map<number, number>;
    forceFeatures?: boolean;
  }
): Promise<EnrichResult> {
  const { matchSmId, wyscoutMatchId, advancedStats, events, teamSmIdByWyId } = args;

  await upsertProviderPayload(supabase, {
    provider: "wyscout",
    endpoint: `/matches/${wyscoutMatchId}/advancedstats`,
    entityType: "match_advancedstats",
    entityKey: String(wyscoutMatchId),
    payload: advancedStats,
  });
  await upsertProviderPayload(supabase, {
    provider: "wyscout",
    endpoint: `/matches/${wyscoutMatchId}/events`,
    entityType: "match_events",
    entityKey: String(wyscoutMatchId),
    payload: events,
  });

  const { data: statsRows, error: statsErr } = await supabase
    .from("glpm_match_team_stats")
    .select("*")
    .eq("match_sm_id", matchSmId);
  if (statsErr) throw new Error(statsErr.message);
  if (!statsRows?.length) throw new Error(`No SM stats for match ${matchSmId}`);

  const sides = listAdvancedStatsSides(advancedStats);
  const sideByWy = new Map(sides.map((s) => [s.teamId, s]));

  let ppdaUpdated = false;
  let xgFilled = false;
  let psxgFilled = false;
  const conflictIssues: ValidationIssue[] = [];

  for (const row of statsRows) {
    const wyId = [...teamSmIdByWyId.entries()].find(([, sm]) => sm === row.team_sm_id)?.[0];
    if (wyId == null) continue;
    const side = sideByWy.get(wyId);
    if (!side) continue;

    const patch: Database["public"]["Tables"]["glpm_match_team_stats"]["Update"] = {};
    const ppda = ppdaFromSide(side);
    if (ppda != null) {
      patch.ppda = ppda;
      patch.ppda_source = "wyscout";
      ppdaUpdated = true;
    }

    const wyXg = xgFromSide(side);
    if (row.xg == null && wyXg != null) {
      patch.xg = wyXg;
      patch.xg_source = "wyscout";
      xgFilled = true;
    } else if (row.xg != null && wyXg != null && Math.abs(row.xg - wyXg) > 0.15) {
      conflictIssues.push({
        entityType: "match_team_stats",
        entityKey: `${matchSmId}:${row.team_sm_id}`,
        ruleCode: "SOURCE_CONFLICT_XG",
        severity: "warn",
        message: "SportMonks and Wyscout xG diverge; keeping SportMonks value",
        observed: { sportmonks_xg: row.xg, wyscout_xg: wyXg },
      });
    }

    const wyPsxg = psxgFacedFromSide(side);
    if (row.psxg_faced == null && wyPsxg != null) {
      patch.psxg_faced = wyPsxg;
      patch.psxg_source = "wyscout";
      psxgFilled = true;
    }

    const total = (side.total ?? {}) as Record<string, unknown>;
    const wySaves = asNumber(total.gkSaves);
    if (wySaves != null && row.gk_saves == null) {
      patch.gk_saves = wySaves;
    }
    if (
      patch.psxg_faced != null ||
      (row.psxg_faced != null && row.goals != null)
    ) {
      const psxg = patch.psxg_faced ?? row.psxg_faced;
      const oppGoals = statsRows.find((r) => r.team_sm_id !== row.team_sm_id)?.goals;
      if (psxg != null && oppGoals != null && row.goals_prevented == null) {
        patch.goals_prevented = psxg - oppGoals;
      }
    }

    if (Object.keys(patch).length) {
      const { error } = await supabase
        .from("glpm_match_team_stats")
        .update(patch)
        .eq("match_sm_id", matchSmId)
        .eq("team_sm_id", row.team_sm_id);
      if (error) throw new Error(`enrich stats update failed: ${error.message}`);
    }
  }

  const wyPlayerIds = (events.events ?? [])
    .map((e) => e.playerId)
    .filter((id): id is number => id != null);
  const playerSmIdByWyId = await loadPlayerSmIdByWyId(supabase, wyPlayerIds);
  const gkByDefendingTeamSmId = inferGkByTeamFromEvents(
    events.events ?? [],
    teamSmIdByWyId,
    playerSmIdByWyId
  );

  const eventRows = (events.events ?? []).map((e) =>
    mapWyscoutEventRow(e, matchSmId, teamSmIdByWyId, playerSmIdByWyId)
  );
  if (eventRows.length) {
    const { error } = await supabase
      .from("glpm_match_events")
      .upsert(eventRows, { onConflict: "event_id" });
    if (error) throw new Error(`enrich events failed: ${error.message}`);
  }

  const shots = extractShotsFromEvents(events.events ?? [], matchSmId, {
    teamSmIdByWyId,
    playerSmIdByWyId,
    gkByDefendingTeamSmId,
  });
  if (shots.length) {
    // Ensure parent event rows exist for FK
    const shotEvents = shots.map((s) => {
      const ev = eventRows.find((e) => e.event_id === s.event_id);
      return (
        ev ?? {
          event_id: s.event_id,
          match_sm_id: matchSmId,
          team_sm_id: s.team_sm_id,
          source: "wyscout" as const,
          synced_at: new Date().toISOString(),
        }
      );
    });
    await supabase.from("glpm_match_events").upsert(shotEvents, { onConflict: "event_id" });
    const { error } = await supabase
      .from("glpm_match_shots")
      .upsert(shots, { onConflict: "event_id" });
    if (error) throw new Error(`enrich shots failed: ${error.message}`);
  }

  const { data: matchMeta } = await supabase
    .from("glpm_matches")
    .select("home_team_sm_id, away_team_sm_id, home_score, away_score")
    .eq("sm_id", matchSmId)
    .maybeSingle();

  if (matchMeta) {
    await upsertMatchPlayerGkStats(supabase, {
      matchSmId,
      events: events.events ?? [],
      advancedStats,
      teamSmIdByWyId,
      homeGoals: matchMeta.home_score,
      awayGoals: matchMeta.away_score,
      homeTeamSmId: matchMeta.home_team_sm_id,
      awayTeamSmId: matchMeta.away_team_sm_id,
    });
  }

  const { data: refreshed } = await supabase
    .from("glpm_match_team_stats")
    .select("*")
    .eq("match_sm_id", matchSmId);
  const home = refreshed?.find((r) => r.is_home);
  const away = refreshed?.find((r) => !r.is_home);
  let issues = [...conflictIssues];
  if (home && away) {
    const result = await validateAndPersistMatchBundle(supabase, {
      home: {
        match_sm_id: home.match_sm_id,
        team_sm_id: home.team_sm_id,
        is_home: true,
        goals: home.goals,
        xg: home.xg,
        npxg: home.npxg,
        shots: home.shots,
        shots_on_target: home.shots_on_target,
        big_chances: home.big_chances,
        possession_pct: home.possession_pct,
        ppda: home.ppda,
        defensive_actions: home.defensive_actions,
        psxg_faced: home.psxg_faced,
      },
      away: {
        match_sm_id: away.match_sm_id,
        team_sm_id: away.team_sm_id,
        is_home: false,
        goals: away.goals,
        xg: away.xg,
        npxg: away.npxg,
        shots: away.shots,
        shots_on_target: away.shots_on_target,
        big_chances: away.big_chances,
        possession_pct: away.possession_pct,
        ppda: away.ppda,
        defensive_actions: away.defensive_actions,
        psxg_faced: away.psxg_faced,
      },
      knownTeamIds: new Set([home.team_sm_id, away.team_sm_id]),
    });
    issues = [...issues, ...result.issues];
  }

  await buildAndUpsertMatchTeamFeatures(supabase, {
    matchSmId,
    force: args.forceFeatures,
    events: events.events,
    teamSmIdByWyId,
  });

  await buildAndUpsertMatchPlayerGkFeatures(supabase, { matchSmId });

  return {
    matchSmId,
    wyscoutMatchId,
    ppdaUpdated,
    xgFilled,
    psxgFilled,
    shotCount: shots.length,
    issues,
  };
}

export async function enrichMatchFromWyscout(
  supabase: Client,
  client: WyscoutClient,
  matchSmId: number,
  options?: { wyscoutMatchId?: number; forceFeatures?: boolean }
): Promise<EnrichResult> {
  const { data: match, error } = await supabase
    .from("glpm_matches")
    .select("sm_id, home_team_sm_id, away_team_sm_id")
    .eq("sm_id", matchSmId)
    .single();
  if (error || !match) throw new Error(`Match ${matchSmId} not found: ${error?.message}`);

  const wyscoutMatchId = await resolveWyscoutMatchId(
    supabase,
    matchSmId,
    options?.wyscoutMatchId
  );
  const teamSmIdByWyId = await loadTeamWyMap(
    supabase,
    match.home_team_sm_id,
    match.away_team_sm_id
  );
  if (teamSmIdByWyId.size < 2) {
    throw new Error(
      `Need Wyscout team mappings for both sides of match ${matchSmId} in glpm_provider_entity_map`
    );
  }

  const advancedStats = (await client.getMatchAdvancedStats(
    wyscoutMatchId
  )) as WyscoutMatchAdvancedStatsPayload;
  const events = (await client.getMatchEvents(wyscoutMatchId)) as WyscoutMatchEventsPayload;

  return enrichMatchFromWyscoutPayloads(supabase, {
    matchSmId,
    wyscoutMatchId,
    advancedStats,
    events,
    teamSmIdByWyId,
    forceFeatures: options?.forceFeatures,
  });
}

export async function upsertProviderEntityMap(
  supabase: Client,
  row: {
    entityType: "competition" | "season" | "team" | "player" | "match";
    smId: number;
    providerEntityId: number;
    notes?: string;
  }
): Promise<void> {
  const { error } = await supabase.from("glpm_provider_entity_map").upsert(
    {
      entity_type: row.entityType,
      sm_id: row.smId,
      provider: "wyscout",
      provider_entity_id: row.providerEntityId,
      notes: row.notes ?? null,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "entity_type,sm_id,provider" }
  );
  if (error) throw new Error(`upsertProviderEntityMap failed: ${error.message}`);
}
