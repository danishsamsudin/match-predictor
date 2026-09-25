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

const NAME_QUERY_BATCH = 40;
const NAME_QUERY_CONCURRENCY = 8;
/** Min surname length for truncated-stem matching (Kvaratskheli… ↔ Kvaratskhelia). */
const TRUNCATION_STEM_MIN = 6;

/** Strip Scoutlyst / UI truncation markers (`...` / `…`). */
export function stripNameTruncation(displayName: string): string {
  return displayName
    .replace(/\u2026/g, "")
    .replace(/\.{2,}\s*$/g, "")
    .trim();
}

export function playerNameLookupKeys(displayName: string): string[] {
  const norm = normalizeText(stripNameTruncation(displayName));
  const parts = norm.split(" ").filter(Boolean);
  const keys = [norm];
  if (parts.length === 1) {
    return keys;
  }
  if (parts.length >= 2) {
    keys.push(`${parts[0]} ${parts[parts.length - 1]}`);
    keys.push(`${parts[parts.length - 1]} ${parts[0]}`);
    keys.push(parts[parts.length - 1]);
    keys.push(parts[0]);
  }
  return [...new Set(keys)];
}

function surnameLookupKeys(displayName: string): string[] {
  const parts = normalizeText(stripNameTruncation(displayName)).split(" ").filter(Boolean);
  if (parts.length < 2) return parts.length === 1 ? [parts[0]] : [];
  return [...new Set([parts[parts.length - 1], parts[0]])];
}

/** True when surnames share a truncation stem (Scoutlyst cut off mid-name). */
export function surnamesShareTruncationStem(a: string, b: string): boolean {
  const left = surnameLookupKeys(a);
  const right = surnameLookupKeys(b);
  for (const sa of left) {
    for (const sb of right) {
      if (sa.length < TRUNCATION_STEM_MIN || sb.length < TRUNCATION_STEM_MIN) continue;
      if (sa === sb) return true;
      if (sa.startsWith(sb) || sb.startsWith(sa)) return true;
    }
  }
  return false;
}

export function playerNamesLikelyMatch(a: string, b: string): boolean {
  if (!a.trim() || !b.trim()) return false;
  const aParts = normalizeText(stripNameTruncation(a)).split(" ").filter(Boolean);
  const bParts = normalizeText(stripNameTruncation(b)).split(" ").filter(Boolean);
  const bKeys = new Set(playerNameLookupKeys(b));

  // Ignore bare first-name keys when both sides are multi-token (Harry ≠ Harry Maguire).
  const strongA = playerNameLookupKeys(a).filter((key) => {
    if (aParts.length >= 2 && key === aParts[0]) return false;
    return true;
  });
  if (strongA.some((key) => bKeys.has(key))) return true;

  if (!surnamesShareTruncationStem(a, b)) return false;
  // Require matching first initial when both names include a given name.
  if (aParts.length >= 2 && bParts.length >= 2) {
    return aParts[0]![0] === bParts[0]![0];
  }
  return true;
}

function pickHigherOverall(
  map: Map<string, number>,
  key: string,
  overall: number
): void {
  const prev = map.get(key);
  if (prev == null || overall > prev) map.set(key, overall);
}

/** Unique non-empty display-name strings to try as DB equality / ilike targets. */
export function playerNameQueryVariants(displayName: string): string[] {
  const trimmed = displayName.trim();
  if (!trimmed) return [];
  const variants = [trimmed];
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    variants.push(`${parts[0]} ${parts[parts.length - 1]}`);
    variants.push(`${parts[parts.length - 1]} ${parts[0]}`);
  }
  return [...new Set(variants)];
}

async function mapInChunks<T, R>(
  items: T[],
  chunkSize: number,
  mapper: (chunk: T[]) => Promise<R[]>
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    out.push(...(await mapper(chunk)));
  }
  return out;
}

async function runWithConcurrency<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (!items.length) return;
  let next = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (next < items.length) {
        const idx = next;
        next += 1;
        await worker(items[idx]);
      }
    }
  );
  await Promise.all(runners);
}

function mapScoutlystRow(row: {
  scoutlyst_player_key: string;
  player_name: string;
  sofascore_player_id: number | null;
  position: string | null;
  age: number | null;
  rating: number | null;
  stats: unknown;
  snapshot_date: string;
  reference_league_id: number | null;
}): ScoutlystSnapshotRow {
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
}

const SCOUTLYST_SELECT =
  "scoutlyst_player_key, player_name, sofascore_player_id, position, age, rating, stats, snapshot_date, reference_league_id";

/**
 * Latest Scoutlyst row per normalized player name.
 * Uses team-scoped + targeted name queries (no full-table scans).
 */
export async function loadScoutlystSnapshotsByNames(
  supabase: ServiceClient | null,
  displayNames: string[],
  options?: { teamId?: number; pageSize?: number; maxPages?: number }
): Promise<Map<string, ScoutlystSnapshotRow>> {
  // pageSize/maxPages retained for call-site compatibility; scans are no longer used.
  void options?.pageSize;
  void options?.maxPages;

  if (!supabase) return new Map();

  const wanted = new Set<string>();
  for (const name of displayNames) {
    for (const key of playerNameLookupKeys(name)) wanted.add(key);
  }
  if (!wanted.size) return new Map();

  const byName = new Map<string, ScoutlystSnapshotRow>();

  const isResolved = (displayName: string) =>
    playerNameLookupKeys(displayName).some((key) => byName.has(key));

  const ingestRows = (
    rows: Array<{
      scoutlyst_player_key: string;
      player_name: string;
      sofascore_player_id: number | null;
      position: string | null;
      age: number | null;
      rating: number | null;
      stats: unknown;
      snapshot_date: string;
      reference_league_id: number | null;
    }>
  ) => {
    for (const row of rows) {
      const mapped = mapScoutlystRow(row);
      // Exact key overlap first.
      for (const key of playerNameLookupKeys(row.player_name)) {
        if (!wanted.has(key) || byName.has(key)) continue;
        byName.set(key, mapped);
      }
      // Truncated Scoutlyst exports (`Khvicha Kvaratskheli...`) must also
      // register under the full display-name keys the caller asked for.
      for (const displayName of displayNames) {
        if (!playerNamesLikelyMatch(displayName, row.player_name)) continue;
        for (const key of playerNameLookupKeys(displayName)) {
          if (byName.has(key)) continue;
          byName.set(key, mapped);
        }
      }
    }
  };

  if (options?.teamId != null) {
    const { data } = await supabase
      .from("scoutlyst_player_snapshots")
      .select(`${SCOUTLYST_SELECT}, reference_team_id`)
      .eq("reference_team_id", options.teamId)
      .order("snapshot_date", { ascending: false })
      .limit(500);
    ingestRows(data ?? []);
  }

  const unresolvedNames = () =>
    displayNames.filter((displayName) => !isResolved(displayName));

  const exactVariants = [
    ...new Set(unresolvedNames().flatMap((name) => playerNameQueryVariants(name))),
  ];
  if (exactVariants.length) {
    const rows = await mapInChunks(exactVariants, NAME_QUERY_BATCH, async (chunk) => {
      const { data } = await supabase
        .from("scoutlyst_player_snapshots")
        .select(SCOUTLYST_SELECT)
        .in("player_name", chunk)
        .order("snapshot_date", { ascending: false })
        .limit(Math.min(800, chunk.length * 10));
      return data ?? [];
    });
    ingestRows(rows);
  }

  const stillMissing = unresolvedNames();
  await runWithConcurrency(stillMissing, NAME_QUERY_CONCURRENCY, async (displayName) => {
    if (isResolved(displayName)) return;
    const { data } = await supabase
      .from("scoutlyst_player_snapshots")
      .select(SCOUTLYST_SELECT)
      .ilike("player_name", displayName)
      .order("snapshot_date", { ascending: false })
      .limit(5);
    ingestRows(data ?? []);
  });

  // Bounded surname search for remaining gaps (replaces former full-table scan).
  const surnameMissing = unresolvedNames();
  await runWithConcurrency(surnameMissing, NAME_QUERY_CONCURRENCY, async (displayName) => {
    if (isResolved(displayName)) return;
    for (const surname of surnameLookupKeys(displayName)) {
      if (!surname || surname.length < 4) continue;
      // Also search the truncation stem so full DB names match truncated queries
      // and truncated DB names match full queries.
      const stems = [
        surname,
        surname.slice(0, Math.max(TRUNCATION_STEM_MIN, surname.length - 2)),
      ].filter((s, i, arr) => s.length >= 4 && arr.indexOf(s) === i);
      for (const stem of stems) {
        const { data } = await supabase
          .from("scoutlyst_player_snapshots")
          .select(SCOUTLYST_SELECT)
          .ilike("player_name", `%${stem}%`)
          .order("snapshot_date", { ascending: false })
          .limit(20);
        ingestRows(data ?? []);
        if (isResolved(displayName)) break;
      }
      if (isResolved(displayName)) break;
    }
  });

  if (options?.teamId != null) {
    const teamId = options.teamId;
    const teamMissing = unresolvedNames();
    await runWithConcurrency(teamMissing, NAME_QUERY_CONCURRENCY, async (displayName) => {
      if (isResolved(displayName)) return;
      for (const surname of surnameLookupKeys(displayName)) {
        if (!surname || surname.length < 3) continue;
        const { data } = await supabase
          .from("scoutlyst_player_snapshots")
          .select(`${SCOUTLYST_SELECT}, reference_team_id`)
          .eq("reference_team_id", teamId)
          .ilike("player_name", `%${surname}%`)
          .order("snapshot_date", { ascending: false })
          .limit(8);

        for (const row of data ?? []) {
          const rowKeys = playerNameLookupKeys(row.player_name);
          const rowSurnames = surnameLookupKeys(row.player_name);
          const matches =
            rowKeys.some((key) => wanted.has(key)) ||
            rowSurnames.some((s) => surnameLookupKeys(displayName).includes(s));
          if (!matches) continue;
          const mapped = mapScoutlystRow(row);
          for (const key of playerNameLookupKeys(displayName)) {
            if (byName.has(key)) continue;
            byName.set(key, mapped);
          }
        }
        if (isResolved(displayName)) break;
      }
    });
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
  // Fallback: scan map values for truncation-stem matches.
  for (const row of byName.values()) {
    if (playerNamesLikelyMatch(displayName, row.player_name)) return row;
  }
  return null;
}

/**
 * SoFIFA overall by player name across clubs (best overall wins).
 * Uses targeted name queries instead of full-table pagination.
 */
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

  const isResolved = (displayName: string) =>
    playerNameLookupKeys(displayName).some((key) => byName.has(key));

  const ingestRows = (
    rows: Array<{ name: string; sofifa_overall: number | null }>
  ) => {
    for (const row of rows) {
      if (row.sofifa_overall == null) continue;
      const overall = Number(row.sofifa_overall);
      for (const key of playerNameLookupKeys(row.name)) {
        if (!wanted.has(key)) continue;
        pickHigherOverall(byName, key, overall);
      }
    }
  };

  const exactVariants = [
    ...new Set(displayNames.flatMap((name) => playerNameQueryVariants(name))),
  ];
  if (exactVariants.length) {
    const rows = await mapInChunks(exactVariants, NAME_QUERY_BATCH, async (chunk) => {
      const { data } = await supabase
        .from("soccerdata_players")
        .select("name, sofifa_overall")
        .in("name", chunk)
        .not("sofifa_overall", "is", null)
        .limit(Math.min(800, chunk.length * 10));
      return data ?? [];
    });
    ingestRows(rows);
  }

  const stillMissing = displayNames.filter((displayName) => !isResolved(displayName));
  await runWithConcurrency(stillMissing, NAME_QUERY_CONCURRENCY, async (displayName) => {
    if (isResolved(displayName)) return;
    const { data } = await supabase
      .from("soccerdata_players")
      .select("name, sofifa_overall")
      .ilike("name", displayName)
      .not("sofifa_overall", "is", null)
      .limit(10);
    ingestRows(data ?? []);
  });

  const surnameMissing = displayNames.filter((displayName) => !isResolved(displayName));
  await runWithConcurrency(surnameMissing, NAME_QUERY_CONCURRENCY, async (displayName) => {
    if (isResolved(displayName)) return;
    for (const surname of surnameLookupKeys(displayName)) {
      if (!surname || surname.length < 4) continue;
      const { data } = await supabase
        .from("soccerdata_players")
        .select("name, sofifa_overall")
        .ilike("name", `%${surname}%`)
        .not("sofifa_overall", "is", null)
        .limit(20);
      for (const row of data ?? []) {
        if (row.sofifa_overall == null) continue;
        const overall = Number(row.sofifa_overall);
        const rowKeys = playerNameLookupKeys(row.name);
        if (!rowKeys.some((key) => wanted.has(key))) continue;
        for (const key of rowKeys) {
          if (!wanted.has(key)) continue;
          pickHigherOverall(byName, key, overall);
        }
      }
      if (isResolved(displayName)) break;
    }
  });

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
    if (row.sofifa_overall == null) continue;
    const overall = Number(row.sofifa_overall);
    for (const key of playerNameLookupKeys(row.name)) {
      pickHigherOverall(byName, key, overall);
    }
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
