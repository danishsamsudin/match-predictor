import { stableSyntheticPlayerId } from "@/lib/data/build-squad-from-scoutlyst";
import {
  computePlayerPerformanceScore,
  sofifaOverallToScore,
} from "@/lib/data/compute-player-performance-score";
import {
  buildPlayerDetailStats,
  type PlayerDisplayStat,
} from "@/lib/data/player-stat-display";
import {
  comparePlayersByPosition,
  positionDisplayLabel,
} from "@/lib/data/normalize-player-position";
import {
  pickSquadFromRecords,
  squadPickRecordFromStats,
  type SquadPickRecord,
} from "@/lib/data/pick-squad-from-records";
import { loadPreferredFormationForTeam } from "@/lib/data/team-formations";
import {
  getOfficialWcTeamSquad,
  officialWcSquadPublishedDate,
  type OfficialWcPlayer,
} from "@/lib/data/world-cup-2026-official-squads";
import { applyBenchmarkToPerformanceScore } from "@/lib/prediction/team-strength";
import { normalizeText } from "@/lib/soccerdata/normalize";
import type { Database } from "@/lib/supabase";
import type { SquadPlayer, TeamSquadSnapshot } from "@/lib/types/team-comparison";
import type { EntityType } from "@/lib/types/football-lookup";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

type ScoutlystRow = {
  scoutlyst_player_key: string;
  player_name: string;
  sofascore_player_id: number | null;
  position: string | null;
  age: number | null;
  rating: number | null;
  stats: Record<string, string | number | null>;
};

function ageFromDob(dob: string, asOf = new Date(2026, 5, 11)): number | null {
  const parts = dob.split("/").map((p) => Number(p.trim()));
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  if (!day || !month || !year) return null;
  const born = new Date(year, month - 1, day);
  if (Number.isNaN(born.getTime())) return null;
  let age = asOf.getFullYear() - born.getFullYear();
  const monthDelta = asOf.getMonth() - born.getMonth();
  if (monthDelta < 0 || (monthDelta === 0 && asOf.getDate() < born.getDate())) {
    age -= 1;
  }
  return age >= 0 && age < 60 ? age : null;
}

async function loadScoutlystByNames(
  supabase: ServiceClient,
  normalizedNames: string[]
): Promise<Map<string, ScoutlystRow>> {
  const wanted = new Set(normalizedNames.filter(Boolean));
  if (!wanted.size) return new Map();

  const { data } = await supabase
    .from("scoutlyst_player_snapshots")
    .select(
      "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date"
    )
    .order("snapshot_date", { ascending: false })
    .limit(6000);

  const byName = new Map<string, ScoutlystRow>();
  for (const row of data ?? []) {
    const key = normalizeText(row.player_name);
    if (!wanted.has(key) || byName.has(key)) continue;
    const stats =
      row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? (row.stats as Record<string, string | number | null>)
        : {};
    byName.set(key, {
      scoutlyst_player_key: row.scoutlyst_player_key,
      player_name: row.player_name,
      sofascore_player_id: row.sofascore_player_id,
      position: row.position,
      age: row.age != null ? Number(row.age) : null,
      rating: row.rating != null ? Number(row.rating) : null,
      stats,
    });
  }
  return byName;
}

async function loadSofifaByNames(
  supabase: ServiceClient,
  teamId: number,
  normalizedNames: string[]
): Promise<Map<string, number>> {
  const wanted = new Set(normalizedNames.filter(Boolean));
  if (!wanted.size) return new Map();

  const { data } = await supabase
    .from("soccerdata_players")
    .select("name, sofifa_overall")
    .eq("team_id", teamId)
    .not("sofifa_overall", "is", null)
    .limit(500);

  const byName = new Map<string, number>();
  for (const row of data ?? []) {
    const key = normalizeText(row.name);
    if (!wanted.has(key) || row.sofifa_overall == null || byName.has(key)) continue;
    byName.set(key, Number(row.sofifa_overall));
  }
  return byName;
}

function sortSquadPlayers(players: SquadPlayer[]): SquadPlayer[] {
  return [...players].sort((a, b) => {
    const pos = comparePlayersByPosition(
      { position: a.position },
      { position: b.position }
    );
    if (pos !== 0) return pos;
    return (b.performanceScore ?? 0) - (a.performanceScore ?? 0);
  });
}

function toSquadPlayer(input: {
  official: OfficialWcPlayer;
  scoutlyst: ScoutlystRow | null;
  sofifaOverall: number | null;
  isStarter: boolean;
  teamId: number;
  teamName: string;
  entityType?: EntityType;
  benchmarkLeagueId?: number;
}): SquadPlayer {
  const normName = normalizeText(input.official.name);
  const playerKey = `wc2026:${input.teamName}:${normName}`;
  const sofascorePlayerId =
    input.scoutlyst?.sofascore_player_id ?? stableSyntheticPlayerId(playerKey);
  const positionLabel = input.scoutlyst?.position ?? input.official.position;
  const stats = {
    ...input.scoutlyst?.stats,
    club: input.official.club,
    height_cm: input.official.heightCm,
    date_of_birth: input.official.dob,
  };
  const fromStats = computePlayerPerformanceScore({
    scoutlystRating: input.scoutlyst?.rating ?? null,
    matchAvgRating: null,
    stats,
    position: positionLabel,
  });
  const fromSofifa =
    input.sofifaOverall != null ? sofifaOverallToScore(input.sofifaOverall) : null;
  const rawPerformanceScore = Math.max(fromStats ?? 0, fromSofifa ?? 0) || null;
  const performanceScore = applyBenchmarkToPerformanceScore(rawPerformanceScore, {
    entityType: input.entityType,
    teamId: input.teamId,
    teamName: input.teamName,
    leagueId: input.benchmarkLeagueId ?? 1,
  });
  const detailStats: PlayerDisplayStat[] = buildPlayerDetailStats(stats);

  return {
    sofascorePlayerId,
    scoutlystPlayerKey: input.scoutlyst?.scoutlyst_player_key ?? playerKey,
    name: input.official.name,
    position: positionDisplayLabel(positionLabel),
    fieldPosition: positionLabel,
    performanceScore,
    startSharePct: input.isStarter ? null : null,
    detailStats,
    age: input.scoutlyst?.age ?? ageFromDob(input.official.dob),
  };
}

function officialPlayerToRecord(
  player: OfficialWcPlayer,
  teamName: string,
  rating: number | null
): SquadPickRecord {
  const id = `wc2026:${teamName}:${normalizeText(player.name)}`;
  const row = squadPickRecordFromStats({
    id,
    name: player.name,
    position: player.position,
    stats: {
      club: player.club,
      height_cm: player.heightCm,
    },
    rating,
  });
  // FIFA lists have no appearance data; treat everyone as pickable for formation slots.
  return { ...row, starts: 1 };
}

/** Build squad comparison snapshot from FIFA official 26-man list. */
export async function loadOfficialWcSquadForComparison(
  supabase: ServiceClient | null,
  teamId: number,
  teamLabel: string,
  options?: {
    teamName?: string;
    domesticLeagueId?: number;
    entityType?: EntityType;
  }
): Promise<TeamSquadSnapshot | null> {
  const official = getOfficialWcTeamSquad(teamLabel);
  if (!official?.players.length) return null;

  const benchmarkLeagueId = options?.domesticLeagueId ?? 1;
  const formation = supabase
    ? await loadPreferredFormationForTeam(supabase, teamId, teamLabel)
    : null;
  const formationForXi = formation ?? "4-3-3";

  const normalizedNames = official.players.map((p) => normalizeText(p.name));
  const [scoutlystByName, sofifaByName] = supabase
    ? await Promise.all([
        loadScoutlystByNames(supabase, normalizedNames),
        loadSofifaByNames(supabase, teamId, normalizedNames),
      ])
    : [new Map<string, ScoutlystRow>(), new Map<string, number>()];

  const records = official.players.map((player) => {
    const norm = normalizeText(player.name);
    const scout = scoutlystByName.get(norm);
    return officialPlayerToRecord(player, teamLabel, scout?.rating ?? null);
  });
  const { starters: starterRecords, substitutes: subRecords } = pickSquadFromRecords(
    records,
    formationForXi,
    { benchLimit: null }
  );

  const officialByNorm = new Map(
    official.players.map((p) => [normalizeText(p.name), p] as const)
  );

  const mapRecord = (record: SquadPickRecord, isStarter: boolean): SquadPlayer => {
    const src =
      officialByNorm.get(normalizeText(record.name)) ??
      ({
        name: record.name,
        position: record.position ?? "MID",
        dob: "",
        club: String(record.stats.club ?? ""),
        heightCm: Number(record.stats.height_cm ?? 0),
      } satisfies OfficialWcPlayer);
    const norm = normalizeText(src.name);
    return toSquadPlayer({
      official: src,
      scoutlyst: scoutlystByName.get(norm) ?? null,
      sofifaOverall: sofifaByName.get(norm) ?? null,
      isStarter,
      teamId,
      teamName: options?.teamName ?? teamLabel,
      entityType: options?.entityType,
      benchmarkLeagueId,
    });
  };

  return {
    starters: sortSquadPlayers(starterRecords.map((r) => mapRecord(r, true))),
    substitutes: sortSquadPlayers(subRecords.map((r) => mapRecord(r, false))),
    hasLineupData: false,
    hasScoutlystData: scoutlystByName.size > 0,
    squadSource: "fifa_official",
    preferredFormation: formationForXi,
    snapshotDate: officialWcSquadPublishedDate(),
    coach: official.coach,
  };
}
