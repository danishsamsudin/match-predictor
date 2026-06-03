import { normalizeText } from "@/lib/soccerdata/normalize";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ScoutlystSnapshotRow = {
  scoutlyst_player_key: string;
  player_name: string;
  sofascore_player_id: number | null;
  position: string | null;
  age: number | null;
  rating: number | null;
  stats: Record<string, string | number | null>;
  snapshot_date: string;
  reference_league_id: number | null;
};

type ServiceClient = SupabaseClient<Database>;

export function playerNameLookupKeys(displayName: string): string[] {
  const norm = normalizeText(displayName);
  const parts = norm.split(" ").filter(Boolean);
  const keys = [norm];
  if (parts.length >= 2) {
    keys.push(`${parts[0]} ${parts[parts.length - 1]}`);
    keys.push(`${parts[parts.length - 1]} ${parts[0]}`);
  }
  return [...new Set(keys)];
}

function pickHigherOverall(
  map: Map<string, number>,
  key: string,
  overall: number
): void {
  const prev = map.get(key);
  if (prev == null || overall > prev) map.set(key, overall);
}

/** Latest Scoutlyst row per normalized player name (paginated scan). */
export async function loadScoutlystSnapshotsByNames(
  supabase: ServiceClient | null,
  displayNames: string[],
  options?: { teamId?: number; pageSize?: number; maxPages?: number }
): Promise<Map<string, ScoutlystSnapshotRow>> {
  if (!supabase) return new Map();

  const wanted = new Set<string>();
  for (const name of displayNames) {
    for (const key of playerNameLookupKeys(name)) wanted.add(key);
  }
  if (!wanted.size) return new Map();

  const byName = new Map<string, ScoutlystSnapshotRow>();
  const pageSize = options?.pageSize ?? 5000;
  const maxPages = options?.maxPages ?? 20;

  const isResolved = (displayName: string) =>
    playerNameLookupKeys(displayName).some((key) => byName.has(key));

  const resolvedCount = () =>
    displayNames.filter((displayName) => isResolved(displayName)).length;

  const mapRow = (row: {
    scoutlyst_player_key: string;
    player_name: string;
    sofascore_player_id: number | null;
    position: string | null;
    age: number | null;
    rating: number | null;
    stats: unknown;
    snapshot_date: string;
    reference_league_id: number | null;
    reference_team_id?: number | null;
  }): ScoutlystSnapshotRow => {
    const stats =
      row.stats && typeof row.stats === "object" && !Array.isArray(row.stats)
        ? (row.stats as Record<string, string | number | null>)
        : {};
    return {
      scoutlyst_player_key: row.scoutlyst_player_key,
      player_name: row.player_name,
      sofascore_player_id: row.sofascore_player_id,
      position: row.position,
      age: row.age != null ? Number(row.age) : null,
      rating: row.rating != null ? Number(row.rating) : null,
      stats,
      snapshot_date: row.snapshot_date,
      reference_league_id:
        row.reference_league_id != null ? Number(row.reference_league_id) : null,
    };
  };

  if (options?.teamId != null) {
    const { data } = await supabase
      .from("scoutlyst_player_snapshots")
      .select(
        "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date, reference_league_id, reference_team_id"
      )
      .eq("reference_team_id", options.teamId)
      .order("snapshot_date", { ascending: false })
      .limit(500);
    for (const row of data ?? []) {
      for (const key of playerNameLookupKeys(row.player_name)) {
        if (!wanted.has(key) || byName.has(key)) continue;
        byName.set(key, mapRow(row));
      }
    }
  }

  for (let page = 0; page < maxPages && resolvedCount() < displayNames.length; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data } = await supabase
      .from("scoutlyst_player_snapshots")
      .select(
        "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date, reference_league_id"
      )
      .order("snapshot_date", { ascending: false })
      .range(from, to);

    if (!data?.length) break;

    for (const row of data) {
      for (const key of playerNameLookupKeys(row.player_name)) {
        if (!wanted.has(key) || byName.has(key)) continue;
        byName.set(key, mapRow(row));
      }
    }
    if (data.length < pageSize) break;
  }

  const stillMissing = displayNames.filter((displayName) => !isResolved(displayName));
  for (const displayName of stillMissing) {
    const { data } = await supabase
      .from("scoutlyst_player_snapshots")
      .select(
        "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date, reference_league_id"
      )
      .ilike("player_name", displayName)
      .order("snapshot_date", { ascending: false })
      .limit(5);

    for (const row of data ?? []) {
      for (const key of playerNameLookupKeys(row.player_name)) {
        if (!wanted.has(key) || byName.has(key)) continue;
        byName.set(key, mapRow(row));
      }
    }
  }

  return byName;
}

export function resolveScoutlystSnapshot(
  displayName: string,
  byName: Map<string, ScoutlystSnapshotRow>
): ScoutlystSnapshotRow | null {
  for (const key of playerNameLookupKeys(displayName)) {
    const row = byName.get(key);
    if (row) return row;
  }
  return null;
}

/** SoFIFA overall by normalized name across all clubs (best overall wins). */
export async function loadSofifaOverallByNames(
  supabase: ServiceClient | null,
  displayNames: string[]
): Promise<Map<string, number>> {
  if (!supabase) return new Map();

  const wanted = new Set<string>();
  for (const name of displayNames) {
    for (const key of playerNameLookupKeys(name)) wanted.add(key);
  }
  if (!wanted.size) return new Map();

  const byName = new Map<string, number>();
  const pageSize = 5000;
  const maxPages = 20;

  const isResolved = (displayName: string) =>
    playerNameLookupKeys(displayName).some((key) => byName.has(key));

  const resolvedCount = () =>
    displayNames.filter((displayName) => isResolved(displayName)).length;

  for (let page = 0; page < maxPages && resolvedCount() < displayNames.length; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data } = await supabase
      .from("soccerdata_players")
      .select("name, sofifa_overall")
      .not("sofifa_overall", "is", null)
      .range(from, to);

    if (!data?.length) break;

    for (const row of data) {
      if (row.sofifa_overall == null) continue;
      const overall = Number(row.sofifa_overall);
      for (const key of playerNameLookupKeys(row.name)) {
        if (!wanted.has(key)) continue;
        pickHigherOverall(byName, key, overall);
      }
    }
    if (data.length < pageSize) break;
  }

  const stillMissing = displayNames.filter((displayName) => !isResolved(displayName));
  for (const displayName of stillMissing) {
    const { data } = await supabase
      .from("soccerdata_players")
      .select("name, sofifa_overall")
      .ilike("name", displayName)
      .not("sofifa_overall", "is", null)
      .limit(10);

    for (const row of data ?? []) {
      if (row.sofifa_overall == null) continue;
      const overall = Number(row.sofifa_overall);
      for (const key of playerNameLookupKeys(row.name)) {
        if (!wanted.has(key)) continue;
        pickHigherOverall(byName, key, overall);
      }
    }
  }

  return byName;
}

/** SoFIFA overall for players stored under a specific club/nation team id. */
export async function loadSofifaOverallByTeam(
  supabase: ServiceClient,
  teamId: number
): Promise<Map<string, number>> {
  const { data } = await supabase
    .from("soccerdata_players")
    .select("name, sofifa_overall")
    .eq("team_id", teamId)
    .not("sofifa_overall", "is", null)
    .limit(500);

  const byName = new Map<string, number>();
  for (const row of data ?? []) {
    const key = normalizeText(row.name);
    if (!key || row.sofifa_overall == null || byName.has(key)) continue;
    byName.set(key, Number(row.sofifa_overall));
  }
  return byName;
}

export function resolveSofifaOverall(
  displayName: string,
  globalByName: Map<string, number>,
  teamByName?: Map<string, number>
): number | null {
  for (const key of playerNameLookupKeys(displayName)) {
    const team = teamByName?.get(key);
    if (team != null) return team;
    const global = globalByName.get(key);
    if (global != null) return global;
  }
  return null;
}

export async function loadMatchRatingsByPlayerIds(
  supabase: ServiceClient | null,
  playerIds: number[]
): Promise<Map<number, number>> {
  if (!supabase || !playerIds.length) return new Map();

  const unique = [...new Set(playerIds.filter((id) => id > 0))];
  if (!unique.length) return new Map();

  const { data } = await supabase
    .from("synced_player_ratings")
    .select("player_id, club_avg_rating")
    .in("player_id", unique);

  const map = new Map<number, number>();
  for (const row of data ?? []) {
    if (row.club_avg_rating != null) {
      map.set(row.player_id, Number(row.club_avg_rating));
    }
  }
  return map;
}

export function maxPerformanceInputs(
  ...values: Array<number | null | undefined>
): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  return nums.length ? Math.max(...nums) : null;
}
