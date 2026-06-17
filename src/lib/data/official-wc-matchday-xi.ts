import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import { enforceSingleGoalkeeperInXi } from "@/lib/data/formation-lineup";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import type { LineupAppearanceAgg } from "@/lib/data/infer-usual-squad-from-lineups";
import {
  pickLineupStartersFromAppearances,
  pickLineupSubstitutesFromAppearances,
} from "@/lib/data/infer-usual-squad-from-lineups";
import {
  pickSquadFromRecords,
  squadPickRecordFromStats,
  type SquadPickRecord,
} from "@/lib/data/pick-squad-from-records";
import {
  playerNameLookupKeys,
  resolveScoutlystSnapshot,
  type ScoutlystSnapshotRow,
} from "@/lib/data/resolve-squad-player-metrics";
import type { OfficialWcPlayer } from "@/lib/data/world-cup-2026-official-squads";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { TeamSquadSnapshot } from "@/lib/types/team-comparison";

/** Normalized keys for matching SofaScore lineup names to FIFA official lists. */
export function buildOfficialSquadNameKeys(officialPlayers: OfficialWcPlayer[]): Set<string> {
  const keys = new Set<string>();
  for (const player of officialPlayers) {
    const display = formatPlayerDisplayNameIfNeeded(player.name);
    keys.add(normalizeText(display));
    for (const key of playerNameLookupKeys(display)) {
      keys.add(key);
    }
  }
  return keys;
}

export function isPlayerOnOfficialSquad(
  playerName: string,
  officialKeys: Set<string>
): boolean {
  const display = formatPlayerDisplayNameIfNeeded(playerName);
  if (officialKeys.has(normalizeText(display))) return true;
  return playerNameLookupKeys(display).some((key) => officialKeys.has(key));
}

/** Keep only caps for players on the published 26-man roster. */
export function filterLineupToOfficialSquad(
  lineupPlayers: LineupAppearanceAgg[],
  officialKeys: Set<string>
): LineupAppearanceAgg[] {
  return lineupPlayers.filter((p) => isPlayerOnOfficialSquad(p.name, officialKeys));
}

export function lineupAggByNormalizedName(
  players: LineupAppearanceAgg[]
): Map<string, LineupAppearanceAgg> {
  const map = new Map<string, LineupAppearanceAgg>();
  for (const p of players) {
    const key = normalizeText(formatPlayerDisplayNameIfNeeded(p.name));
    if (!map.has(key)) map.set(key, p);
  }
  return map;
}

function officialPlayerToFillRecord(
  player: OfficialWcPlayer,
  teamLabel: string,
  lineup: LineupAppearanceAgg | undefined,
  scoutRating: number | null
): SquadPickRecord {
  const displayName = formatPlayerDisplayNameIfNeeded(player.name);
  const id = `wc2026:${teamLabel}:${normalizeText(displayName)}`;
  const row = squadPickRecordFromStats({
    id,
    name: displayName,
    position: player.position,
    stats: {
      club: player.club,
      height_cm: player.heightCm,
    },
    rating: scoutRating,
  });
  const starts = lineup?.starts ?? 0;
  const subAppearances = lineup?.subAppearances ?? 0;
  return { ...row, starts, subAppearances };
}

function fillStartersToEleven(
  starters: LineupAppearanceAgg[],
  officialPlayers: OfficialWcPlayer[],
  lineupByName: Map<string, LineupAppearanceAgg>,
  formation: string,
  teamLabel: string,
  scoutlystByName: Map<string, ScoutlystSnapshotRow>
): LineupAppearanceAgg[] {
  if (starters.length >= 11) return starters.slice(0, 11);

  const starterIds = new Set(starters.map((p) => p.sofascorePlayerId));
  const records: SquadPickRecord[] = [];

  for (const official of officialPlayers) {
    const displayName = formatPlayerDisplayNameIfNeeded(official.name);
    const norm = normalizeText(displayName);
    const lineup = lineupByName.get(norm);
    const sofascoreId = lineup?.sofascorePlayerId;
    if (sofascoreId != null && starterIds.has(sofascoreId)) continue;

    const scout = resolveScoutlystSnapshot(displayName, scoutlystByName);
    records.push(
      officialPlayerToFillRecord(official, teamLabel, lineup, scout?.rating ?? null)
    );
  }

  const { starters: fillSlots } = pickSquadFromRecords(records, formation, {
    entityType: "national",
  });
  const filled: LineupAppearanceAgg[] = [...starters];

  for (const slot of fillSlots) {
    if (filled.length >= 11) break;
    const norm = normalizeText(formatPlayerDisplayNameIfNeeded(slot.name));
    const fromLineup = lineupByName.get(norm);
    if (fromLineup && !starterIds.has(fromLineup.sofascorePlayerId)) {
      filled.push(fromLineup);
      starterIds.add(fromLineup.sofascorePlayerId);
      continue;
    }
    const scout = resolveScoutlystSnapshot(slot.name, scoutlystByName);
    const syntheticId =
      fromLineup?.sofascorePlayerId ??
      scout?.sofascore_player_id ??
      stableSyntheticPlayerId(`wc2026:${teamLabel}:${norm}`);
    if (starterIds.has(syntheticId)) continue;
    filled.push({
      sofascorePlayerId: syntheticId,
      name: slot.name,
      position: slot.position,
      fieldPosition: slot.position,
      starts: slot.starts,
      subAppearances: slot.subAppearances,
      startPositionCounts: {},
      startSubRoleCounts: {},
    });
    starterIds.add(syntheticId);
  }

  return filled.slice(0, 11);
}

function buildRosterPositionById(
  officialPlayers: OfficialWcPlayer[],
  lineupByName: Map<string, LineupAppearanceAgg>,
  scoutlystByName: Map<string, ScoutlystSnapshotRow>,
  teamLabel: string
): Map<number, string | null> {
  const map = new Map<number, string | null>();
  for (const official of officialPlayers) {
    const displayName = formatPlayerDisplayNameIfNeeded(official.name);
    const norm = normalizeText(displayName);
    const lineup = lineupByName.get(norm);
    const scout = resolveScoutlystSnapshot(displayName, scoutlystByName);
    const id =
      lineup?.sofascorePlayerId ??
      scout?.sofascore_player_id ??
      stableSyntheticPlayerId(`wc2026:${teamLabel}:${norm}`);
    map.set(id, official.position);
  }
  return map;
}

function buildOfficialSquadPool(
  officialPlayers: OfficialWcPlayer[],
  lineupByName: Map<string, LineupAppearanceAgg>,
  scoutlystByName: Map<string, ScoutlystSnapshotRow>,
  teamLabel: string
): LineupAppearanceAgg[] {
  return officialPlayers.map((official) => {
    const displayName = formatPlayerDisplayNameIfNeeded(official.name);
    const norm = normalizeText(displayName);
    const lineup = lineupByName.get(norm);
    const scout = resolveScoutlystSnapshot(displayName, scoutlystByName);
    if (lineup) return lineup;
    return {
      sofascorePlayerId:
        scout?.sofascore_player_id ??
        stableSyntheticPlayerId(`wc2026:${teamLabel}:${norm}`),
      name: displayName,
      position: official.position,
      fieldPosition: official.position,
      starts: 0,
      subAppearances: 0,
      startPositionCounts: {},
      startSubRoleCounts: {},
    };
  });
}

function finalizeStarters(
  starters: LineupAppearanceAgg[],
  input: {
    officialPlayers: OfficialWcPlayer[];
    lineupByName: Map<string, LineupAppearanceAgg>;
    scoutlystByName: Map<string, ScoutlystSnapshotRow>;
    teamLabel: string;
    qualityById: Map<number, number>;
  }
): LineupAppearanceAgg[] {
  const trimmed = starters.slice(0, 11);
  if (!trimmed.length) return trimmed;

  const rosterById = buildRosterPositionById(
    input.officialPlayers,
    input.lineupByName,
    input.scoutlystByName,
    input.teamLabel
  );
  const pool = buildOfficialSquadPool(
    input.officialPlayers,
    input.lineupByName,
    input.scoutlystByName,
    input.teamLabel
  );

  return enforceSingleGoalkeeperInXi(trimmed, pool, {
    rosterPositionById: rosterById,
    qualityById: input.qualityById,
  });
}

export type WcMatchdayXiResult = {
  starters: LineupAppearanceAgg[];
  substitutes: LineupAppearanceAgg[];
  squadSource: TeamSquadSnapshot["squadSource"];
  preferredFormation: string;
};

/**
 * Predicted matchday XI from recent international lineups, constrained to the official 26.
 */
export async function pickOfficialWcMatchdayXi(input: {
  officialPlayers: OfficialWcPlayer[];
  lineupPlayers: LineupAppearanceAgg[];
  lineupPreferredFormation: string | null;
  storedFormation: string | null;
  formationDefault: string;
  qualityById: Map<number, number>;
  teamLabel: string;
  scoutlystByName: Map<string, ScoutlystSnapshotRow>;
  supabase?: import("@supabase/supabase-js").SupabaseClient<
    import("@/lib/supabase").Database
  > | null;
  teamId?: number;
  teamName?: string;
  clubMinutesById?: Map<number, number>;
  clubRatingById?: Map<number, number>;
}): Promise<WcMatchdayXiResult> {
  const officialKeys = buildOfficialSquadNameKeys(input.officialPlayers);
  const capped = filterLineupToOfficialSquad(input.lineupPlayers, officialKeys);
  const formationForXi =
    input.lineupPreferredFormation ?? input.storedFormation ?? input.formationDefault;

  const lineupByName = lineupAggByNormalizedName(capped);
  const rosterById = buildRosterPositionById(
    input.officialPlayers,
    lineupByName,
    input.scoutlystByName,
    input.teamLabel
  );
  const hasCaps = capped.some((p) => p.starts > 0);

  if (!hasCaps) {
    const records = input.officialPlayers.map((player) => {
      const displayName = formatPlayerDisplayNameIfNeeded(player.name);
      const scout = resolveScoutlystSnapshot(displayName, input.scoutlystByName);
      const lineup = lineupByName.get(normalizeText(displayName));
      return officialPlayerToFillRecord(
        player,
        input.teamLabel,
        lineup,
        scout?.rating ?? null
      );
    });
    const { starters: starterRecords, substitutes: subRecords } = pickSquadFromRecords(
      records,
      formationForXi,
      { benchLimit: null, entityType: "national" }
    );
    const recordToAgg = (r: SquadPickRecord): LineupAppearanceAgg => {
      const norm = normalizeText(formatPlayerDisplayNameIfNeeded(r.name));
      const fromLineup = lineupByName.get(norm);
      if (fromLineup) return fromLineup;
      const scout = resolveScoutlystSnapshot(r.name, input.scoutlystByName);
      return {
        sofascorePlayerId:
          scout?.sofascore_player_id ??
          stableSyntheticPlayerId(`wc2026:${input.teamLabel}:${norm}`),
        name: r.name,
        position: r.position,
        fieldPosition: r.position,
        starts: r.starts,
        subAppearances: r.subAppearances,
        startPositionCounts: {},
        startSubRoleCounts: {},
      };
    };
    return {
      starters: finalizeStarters(starterRecords.map(recordToAgg), {
        officialPlayers: input.officialPlayers,
        lineupByName,
        scoutlystByName: input.scoutlystByName,
        teamLabel: input.teamLabel,
        qualityById: input.qualityById,
      }),
      substitutes: subRecords.map(recordToAgg),
      squadSource: "fifa_official",
      preferredFormation: formationForXi,
    };
  }

  let starters = await pickLineupStartersFromAppearances(
    capped,
    formationForXi,
    input.qualityById,
    {
      requireStarts: true,
      entityType: "national",
      clubMinutesById: input.clubMinutesById,
      clubRatingById: input.clubRatingById,
      rosterPositionById: rosterById,
      supabase: input.supabase ?? undefined,
      teamId: input.teamId,
      teamName: input.teamName,
    }
  );
  starters = fillStartersToEleven(
    starters,
    input.officialPlayers,
    lineupByName,
    formationForXi,
    input.teamLabel,
    input.scoutlystByName
  );
  starters = finalizeStarters(starters, {
    officialPlayers: input.officialPlayers,
    lineupByName,
    scoutlystByName: input.scoutlystByName,
    teamLabel: input.teamLabel,
    qualityById: input.qualityById,
  });

  const starterIds = new Set(starters.map((p) => p.sofascorePlayerId));
  const substitutes = pickLineupSubstitutesFromAppearances(capped, starterIds, 15);

  const subIds = new Set(substitutes.map((p) => p.sofascorePlayerId));
  for (const official of input.officialPlayers) {
    if (substitutes.length >= 15) break;
    const displayName = formatPlayerDisplayNameIfNeeded(official.name);
    const norm = normalizeText(displayName);
    const lineup = lineupByName.get(norm);
    const id =
      lineup?.sofascorePlayerId ??
      resolveScoutlystSnapshot(displayName, input.scoutlystByName)?.sofascore_player_id;
    if (id != null && (starterIds.has(id) || subIds.has(id))) continue;
    substitutes.push(
      lineup ?? {
        sofascorePlayerId:
          id ?? stableSyntheticPlayerId(`wc2026:${input.teamLabel}:${norm}`),
        name: displayName,
        position: official.position,
        fieldPosition: official.position,
        starts: 0,
        subAppearances: 0,
        startPositionCounts: {},
        startSubRoleCounts: {},
      }
    );
    if (id != null) subIds.add(id);
  }

  return {
    starters,
    substitutes,
    squadSource: "lineups",
    preferredFormation: formationForXi,
  };
}
