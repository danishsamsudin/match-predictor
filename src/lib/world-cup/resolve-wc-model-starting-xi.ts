import { aggregateLineupAppearances } from "@/lib/data/infer-usual-squad-from-lineups";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import {
  loadSofifaPlayersForTeam,
  type SofifaDbPlayerRow,
} from "@/lib/data/load-sofifa-wc-squad-for-comparison";
import { loadPreferredFormationForTeam } from "@/lib/data/team-formations";
import {
  buildOfficialSquadNameKeys,
  isPlayerOnOfficialSquad,
  pickOfficialWcMatchdayXi,
} from "@/lib/data/official-wc-matchday-xi";
import { resolveSquadPlayerLineupRole } from "@/lib/data/normalize-player-position";
import { buildLineupQualityMap } from "@/lib/data/build-lineup-quality-map";
import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import {
  getOfficialWcTeamSquad,
  resolveWc2026TeamLabel,
} from "@/lib/data/world-cup-2026-official-squads";
import {
  loadMatchRatingsByPlayerIds,
  loadScoutlystSnapshotsByNames,
  loadSofifaOverallByNames,
  loadSofifaOverallByTeam,
  resolveScoutlystSnapshot,
  type ScoutlystSnapshotRow,
} from "@/lib/data/resolve-squad-player-metrics";
import { buildClubMetricsBySofascoreId } from "@/lib/data/build-club-metrics-for-lineup";
import { normalizeText } from "@/lib/soccerdata/normalize";
import { projectWcModelXiFromLastStartersWithDetails } from "@/lib/world-cup/resolve-wc-lineup-player-stats";
import {
  isPlayerNameSuspended,
} from "@/lib/world-cup/wc-tournament-discipline";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

function scoutlystBySofascoreId(
  snapshots: Map<string, ScoutlystSnapshotRow>
): Map<number, ScoutlystSnapshotRow> {
  const byId = new Map<number, ScoutlystSnapshotRow>();
  for (const row of snapshots.values()) {
    if (row.sofascore_player_id != null && !byId.has(row.sofascore_player_id)) {
      byId.set(row.sofascore_player_id, row);
    }
  }
  return byId;
}

export type WcModelXiSource =
  | "sofifa_squad_table"
  | "matchday_xi"
  | "last_wc_match"
  | "none";

export type WcModelXiResolution = {
  playerNames: string[];
  playerDetails: Array<{ name: string; squadRole: string | null; squadOrder: number }>;
  source: WcModelXiSource;
  coverage: { matched: number; total: number };
  warnings: string[];
  validation: {
    onOfficialSquad: boolean;
    hasGoalkeeper: boolean;
    usedSubRule: boolean;
  };
};

function isGoalkeeperRole(role: string | null | undefined, position: string | null | undefined): boolean {
  if (role === "GK" || role === "G") return true;
  const broad = resolveSquadPlayerLineupRole({
    fieldPosition: role,
    position: position ?? "",
  });
  return broad === "G";
}

function validateXiNames(
  names: string[],
  officialKeys: Set<string>,
  details: Array<{ name: string; squadRole: string | null; squadOrder: number }>
): { ok: boolean; warnings: string[]; onOfficialSquad: boolean; hasGoalkeeper: boolean } {
  const warnings: string[] = [];
  const unique = new Set(names.map((n) => normalizeText(n)));
  if (names.length < 11 || unique.size < 11) {
    warnings.push(`Expected 11 unique players, got ${unique.size}`);
    return { ok: false, warnings, onOfficialSquad: false, hasGoalkeeper: false };
  }

  const offSquad = names.filter((n) => !isPlayerOnOfficialSquad(n, officialKeys));
  const onOfficialSquad = offSquad.length === 0;
  if (offSquad.length) {
    warnings.push(`Players not on FIFA 26-man roster: ${offSquad.join(", ")}`);
  }

  const gkCount = details.filter((d) => isGoalkeeperRole(d.squadRole, d.squadRole)).length;
  const hasGoalkeeper = gkCount === 1;
  if (!hasGoalkeeper) {
    warnings.push(`Expected exactly 1 goalkeeper, found ${gkCount}`);
  }

  const ok = onOfficialSquad && hasGoalkeeper;
  return { ok, warnings, onOfficialSquad, hasGoalkeeper };
}

function sofifaRowsToResolution(
  rows: SofifaDbPlayerRow[],
  officialKeys: Set<string>,
  excludedPlayerNames: Set<string> = new Set()
): WcModelXiResolution | null {
  const pool = [...rows].sort((a, b) => (a.squad_order ?? 999) - (b.squad_order ?? 999));
  const starters = pool
    .filter((row) => !isPlayerNameSuspended(row.name, excludedPlayerNames))
    .slice(0, 11);

  if (starters.length < 11) return null;

  const playerNames = starters.map((row) => formatPlayerDisplayNameIfNeeded(row.name));
  const playerDetails = starters.map((row, idx) => ({
    name: formatPlayerDisplayNameIfNeeded(row.name),
    squadRole: row.field_position ?? row.position,
    squadOrder: row.squad_order ?? idx,
  }));

  const validation = validateXiNames(playerNames, officialKeys, playerDetails);
  if (!validation.ok) return null;

  return {
    playerNames,
    playerDetails,
    source: "sofifa_squad_table",
    coverage: { matched: 11, total: 11 },
    warnings: [],
    validation: {
      onOfficialSquad: validation.onOfficialSquad,
      hasGoalkeeper: validation.hasGoalkeeper,
      usedSubRule: true,
    },
  };
}

async function resolveFromMatchdayXi(input: {
  supabase: ServiceClient;
  teamApiId: number;
  teamLabel: string;
  teamName: string;
  officialKeys: Set<string>;
}): Promise<WcModelXiResolution | null> {
  const official = getOfficialWcTeamSquad(input.teamLabel);
  if (!official?.players.length) return null;

  const displayNames = official.players.map((p) =>
    formatPlayerDisplayNameIfNeeded(p.name)
  );

  const storedFormation = await loadPreferredFormationForTeam(
    input.supabase,
    input.teamApiId,
    input.teamLabel
  );

  const [scoutlystByName, sofifaGlobal, sofifaTeam, lineupAgg] = await Promise.all([
    loadScoutlystSnapshotsByNames(input.supabase, displayNames, {
      teamId: input.teamApiId,
    }),
    loadSofifaOverallByNames(input.supabase, displayNames),
    loadSofifaOverallByTeam(input.supabase, input.teamApiId),
    aggregateLineupAppearances(input.supabase, input.teamApiId, input.teamName, 12, {
      entityType: "national",
    }),
  ]);

  const lineupIdByName = new Map<string, number>();
  for (const p of lineupAgg.players) {
    const key = normalizeText(formatPlayerDisplayNameIfNeeded(p.name));
    if (!lineupIdByName.has(key)) lineupIdByName.set(key, p.sofascorePlayerId);
  }

  const sofascoreIds = new Set<number>();
  for (const name of displayNames) {
    const scout = resolveScoutlystSnapshot(name, scoutlystByName);
    const lineupId = lineupIdByName.get(normalizeText(name));
    const id =
      scout?.sofascore_player_id ??
      lineupId ??
      stableSyntheticPlayerId(`wc2026:${input.teamLabel}:${normalizeText(name)}`);
    if (id > 0) sofascoreIds.add(id);
  }
  for (const p of lineupAgg.players) {
    if (p.sofascorePlayerId > 0) sofascoreIds.add(p.sofascorePlayerId);
  }

  const matchRatings = await loadMatchRatingsByPlayerIds(input.supabase, [...sofascoreIds]);
  const qualityById = buildLineupQualityMap(lineupAgg.players, {
    bySofascoreId: scoutlystBySofascoreId(scoutlystByName),
    byName: scoutlystByName,
    globalByName: scoutlystByName,
    matchRatings,
    sofifaByName: sofifaTeam,
    sofifaGlobalByName: sofifaGlobal,
  });

  const scoutById = scoutlystBySofascoreId(scoutlystByName);
  const { clubMinutesById, clubRatingById } = buildClubMetricsBySofascoreId(scoutById);

  const matchday = await pickOfficialWcMatchdayXi({
    officialPlayers: official.players,
    lineupPlayers: lineupAgg.players,
    lineupPreferredFormation: lineupAgg.preferredFormation,
    storedFormation,
    formationDefault: "4-3-3",
    qualityById,
    teamLabel: input.teamLabel,
    scoutlystByName,
    supabase: input.supabase,
    teamId: input.teamApiId,
    teamName: input.teamName,
    clubMinutesById,
    clubRatingById,
  });

  if (matchday.starters.length < 11) return null;

  const playerNames = matchday.starters
    .slice(0, 11)
    .map((p) => formatPlayerDisplayNameIfNeeded(p.name));
  const playerDetails = matchday.starters.slice(0, 11).map((p, idx) => ({
    name: formatPlayerDisplayNameIfNeeded(p.name),
    squadRole: p.fieldPosition ?? p.position,
    squadOrder: idx,
  }));

  const validation = validateXiNames(playerNames, input.officialKeys, playerDetails);
  if (!validation.ok) return null;

  return {
    playerNames,
    playerDetails,
    source: "matchday_xi",
    coverage: { matched: 11, total: 11 },
    warnings: [],
    validation: {
      onOfficialSquad: validation.onOfficialSquad,
      hasGoalkeeper: validation.hasGoalkeeper,
      usedSubRule: false,
    },
  };
}

function emptyResolution(warnings: string[]): WcModelXiResolution {
  return {
    playerNames: [],
    playerDetails: [],
    source: "none",
    coverage: { matched: 0, total: 11 },
    warnings,
    validation: {
      onOfficialSquad: false,
      hasGoalkeeper: false,
      usedSubRule: false,
    },
  };
}

function applySuspensionExclusionsToXi(
  resolution: WcModelXiResolution,
  excludedPlayerNames: Set<string>,
  refillPool: Array<{ name: string; squadRole: string | null; squadOrder: number }>,
  officialKeys: Set<string>
): WcModelXiResolution {
  if (!excludedPlayerNames.size) return resolution;

  const kept: Array<{ name: string; squadRole: string | null; squadOrder: number }> = [];
  for (let i = 0; i < resolution.playerNames.length; i++) {
    const name = resolution.playerNames[i]!;
    if (!isPlayerNameSuspended(name, excludedPlayerNames)) {
      kept.push({
        name,
        squadRole: resolution.playerDetails[i]?.squadRole ?? null,
        squadOrder: resolution.playerDetails[i]?.squadOrder ?? i,
      });
    }
  }

  const used = new Set(kept.map((p) => normalizeText(p.name)));
  const sortedPool = [...refillPool].sort((a, b) => a.squadOrder - b.squadOrder);
  for (const candidate of sortedPool) {
    if (kept.length >= 11) break;
    if (isPlayerNameSuspended(candidate.name, excludedPlayerNames)) continue;
    const key = normalizeText(candidate.name);
    if (used.has(key)) continue;
    kept.push(candidate);
    used.add(key);
  }

  if (kept.length < 11) {
    return {
      ...resolution,
      warnings: [
        ...resolution.warnings,
        `Only ${kept.length}/11 available after ${excludedPlayerNames.size} suspension(s).`,
      ],
    };
  }

  const playerNames = kept.map((p) => p.name);
  const playerDetails = kept.map((p, idx) => ({
    name: p.name,
    squadRole: p.squadRole,
    squadOrder: p.squadOrder ?? idx,
  }));
  const validation = validateXiNames(playerNames, officialKeys, playerDetails);
  const suspendedList = [...excludedPlayerNames].join(", ");

  return {
    ...resolution,
    playerNames,
    playerDetails,
    warnings: [
      ...resolution.warnings,
      `Excluded suspended player(s): ${suspendedList}.`,
      ...validation.warnings,
    ],
    validation: {
      onOfficialSquad: validation.onOfficialSquad,
      hasGoalkeeper: validation.hasGoalkeeper,
      usedSubRule: resolution.validation.usedSubRule,
    },
  };
}

/** Resolve Model Squad XI: SoFIFA Squad table → matchday XI → last WC Opta starters. */
export async function resolveWcModelStartingXi(input: {
  supabase: ServiceClient;
  teamApiId: number;
  teamName?: string;
  excludedPlayerNames?: Set<string>;
}): Promise<WcModelXiResolution> {
  const teamLabel = resolveWc2026TeamLabel(input.teamName, input.teamApiId);
  const teamName = input.teamName ?? teamLabel ?? String(input.teamApiId);
  const warnings: string[] = [];
  const excluded = input.excludedPlayerNames ?? new Set<string>();

  const official = teamLabel ? getOfficialWcTeamSquad(teamLabel) : null;
  const officialKeys = buildOfficialSquadNameKeys(official?.players ?? []);
  const officialRefillPool =
    official?.players.map((p, idx) => ({
      name: formatPlayerDisplayNameIfNeeded(p.name),
      squadRole: p.position ?? null,
      squadOrder: idx,
    })) ?? [];

  if (teamLabel) {
    const sofifaRows = await loadSofifaPlayersForTeam(input.supabase, input.teamApiId);
    const sofifaRefillPool = sofifaRows.map((row, idx) => ({
      name: formatPlayerDisplayNameIfNeeded(row.name),
      squadRole: row.field_position ?? row.position,
      squadOrder: row.squad_order ?? idx,
    }));
    if (sofifaRows.length) {
      const fromSofifa = sofifaRowsToResolution(sofifaRows, officialKeys, excluded);
      if (fromSofifa) {
        return applySuspensionExclusionsToXi(
          fromSofifa,
          excluded,
          sofifaRefillPool.length ? sofifaRefillPool : officialRefillPool,
          officialKeys
        );
      }

      const starters = sofifaRows
        .filter((row) => row.is_starter === true)
        .sort((a, b) => (a.squad_order ?? 999) - (b.squad_order ?? 999))
        .slice(0, 11);
      const names = starters.map((row) => formatPlayerDisplayNameIfNeeded(row.name));
      const details = starters.map((row, idx) => ({
        name: formatPlayerDisplayNameIfNeeded(row.name),
        squadRole: row.field_position ?? row.position,
        squadOrder: row.squad_order ?? idx,
      }));
      const check = validateXiNames(names, officialKeys, details);
      warnings.push(...check.warnings, "SoFIFA Squad-table XI failed validation; trying matchday XI");
    } else {
      warnings.push("No SoFIFA squad rows in DB");
    }

    const fromMatchday = await resolveFromMatchdayXi({
      supabase: input.supabase,
      teamApiId: input.teamApiId,
      teamLabel,
      teamName,
      officialKeys,
    });
    if (fromMatchday) {
      return applySuspensionExclusionsToXi(
        { ...fromMatchday, warnings: [...warnings, ...fromMatchday.warnings] },
        excluded,
        officialRefillPool,
        officialKeys
      );
    }
    warnings.push("Matchday XI unavailable or failed validation");
  }

  const lastDetails = await projectWcModelXiFromLastStartersWithDetails({
    supabase: input.supabase,
    teamApiId: input.teamApiId,
  });

  if (lastDetails.length >= 11) {
    const slice = lastDetails.slice(0, 11);
    const playerNames = slice.map((d) => d.name);
    const playerDetails = slice.map((d) => ({
      name: d.name,
      squadRole: d.position,
      squadOrder: d.squadOrder,
    }));
    const validation = validateXiNames(playerNames, officialKeys, playerDetails);
    if (validation.ok || officialKeys.size === 0) {
      const resolution: WcModelXiResolution = {
        playerNames,
        playerDetails,
        source: "last_wc_match",
        coverage: { matched: playerNames.length, total: 11 },
        warnings: [...warnings, ...validation.warnings],
        validation: {
          onOfficialSquad: validation.onOfficialSquad,
          hasGoalkeeper: validation.hasGoalkeeper,
          usedSubRule: false,
        },
      };
      return applySuspensionExclusionsToXi(
        resolution,
        excluded,
        [
          ...lastDetails.map((d, idx) => ({
            name: d.name,
            squadRole: d.position,
            squadOrder: d.squadOrder ?? idx,
          })),
          ...officialRefillPool,
        ],
        officialKeys
      );
    }
    warnings.push(...validation.warnings, "Last WC match XI failed validation");
  } else {
    warnings.push("No WC Opta starter data for team");
  }

  return emptyResolution(warnings);
}
