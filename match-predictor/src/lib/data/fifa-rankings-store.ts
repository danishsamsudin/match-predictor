import { normalizeFifaDatasetTeamName } from "@/lib/data/fifa-ranking-aliases";
import {
  normalizeNationalTeamName,
  WORLD_CUP_2026_TEAMS,
} from "@/lib/data/world-cup-2026-teams";
import { tryCreateServiceClient } from "@/lib/supabase";

export interface FifaRankingEntry {
  rank: number;
  points: number;
  teamName: string;
  normalizedName: string;
}

export interface FifaSnapshotKey {
  year: number;
  semester: 1 | 2;
}

type SnapshotIndex = Map<string, Map<string, FifaRankingEntry>>;
type SnapshotMetaIndex = Map<string, { dataSource: string | null }>;

let loadPromise: Promise<void> | null = null;
let snapshotIndex: SnapshotIndex | null = null;
let snapshotMeta: SnapshotMetaIndex | null = null;
let latestSnapshot: FifaSnapshotKey | null = null;
let latestDataSource: string | null = null;
let latestByTeam: Map<string, FifaRankingEntry> | null = null;
let latestByTeamId: Map<number, FifaRankingEntry> | null = null;

function snapshotKey(year: number, semester: number): string {
  return `${year}-${semester}`;
}

export function resolveFifaSnapshotForDate(isoDate: string): FifaSnapshotKey {
  const year = Number.parseInt(isoDate.slice(0, 4), 10);
  const month = Number.parseInt(isoDate.slice(5, 7), 10) || 6;
  if (!Number.isFinite(year)) {
    return { year: 2026, semester: 1 };
  }
  const semester: 1 | 2 = month <= 6 ? 1 : 2;
  return { year, semester };
}

function pickSnapshotKey(
  target: FifaSnapshotKey,
  index: SnapshotIndex
): FifaSnapshotKey | null {
  const candidates: FifaSnapshotKey[] = [
    target,
    { year: target.year, semester: 1 },
    { year: target.year - 1, semester: 2 },
    { year: target.year - 1, semester: 1 },
  ];

  for (const c of candidates) {
    if (index.has(snapshotKey(c.year, c.semester))) return c;
  }

  let best: FifaSnapshotKey | null = null;
  for (const key of index.keys()) {
    const [y, s] = key.split("-").map(Number);
    if (!best) {
      best = { year: y, semester: s as 1 | 2 };
      continue;
    }
    if (y > best.year || (y === best.year && s > best.semester)) {
      best = { year: y, semester: s as 1 | 2 };
    }
  }
  return best;
}

function rebuildLatestByTeamId(): void {
  if (!latestByTeam) {
    latestByTeamId = null;
    return;
  }
  const byId = new Map<number, FifaRankingEntry>();
  for (const team of WORLD_CUP_2026_TEAMS) {
    const entry = latestByTeam.get(normalizeFifaDatasetTeamName(team.name));
    if (entry) byId.set(team.id, entry);
  }
  latestByTeamId = byId;
}

export async function ensureFifaRankingsLoaded(): Promise<boolean> {
  const cached = snapshotIndex;
  if (cached != null && cached.size > 0) return true;
  if (!loadPromise) loadPromise = loadFromSupabase();
  await loadPromise;
  const loaded = snapshotIndex;
  return loaded != null && loaded.size > 0;
}

async function loadFromSupabase(): Promise<void> {
  const supabase = tryCreateServiceClient();
  if (!supabase) return;

  const { data, error } = await supabase
    .from("fifa_ranking_snapshots")
    .select(
      "ranking_year, semester, rank, team_name, total_points, normalized_team_name, data_source, sofascore_team_id"
    )
    .order("ranking_year", { ascending: true })
    .order("semester", { ascending: true })
    .order("rank", { ascending: true });

  if (error || !data?.length) {
    snapshotIndex = null;
    snapshotMeta = null;
    latestSnapshot = null;
    latestDataSource = null;
    latestByTeam = null;
    latestByTeamId = null;
    return;
  }

  const index: SnapshotIndex = new Map();
  const meta: SnapshotMetaIndex = new Map();
  const idToEntry = new Map<number, FifaRankingEntry>();

  for (const row of data) {
    const key = snapshotKey(row.ranking_year, row.semester);
    if (!index.has(key)) index.set(key, new Map());
    const entry: FifaRankingEntry = {
      rank: row.rank,
      points: Number(row.total_points),
      teamName: row.team_name,
      normalizedName: row.normalized_team_name,
    };
    index.get(key)!.set(row.normalized_team_name, entry);

    if (!meta.has(key)) {
      meta.set(key, { dataSource: row.data_source ?? null });
    }

    if (row.sofascore_team_id != null) {
      idToEntry.set(row.sofascore_team_id, entry);
    }
  }

  snapshotIndex = index;
  snapshotMeta = meta;

  let bestKey: FifaSnapshotKey | null = null;
  for (const key of index.keys()) {
    const [y, s] = key.split("-").map(Number);
    const candidate = { year: y, semester: s as 1 | 2 };
    if (
      !bestKey ||
      candidate.year > bestKey.year ||
      (candidate.year === bestKey.year && candidate.semester > bestKey.semester)
    ) {
      bestKey = candidate;
    }
  }
  latestSnapshot = bestKey;
  latestDataSource = bestKey
    ? (meta.get(snapshotKey(bestKey.year, bestKey.semester))?.dataSource ?? null)
    : null;
  latestByTeam = bestKey
    ? new Map(index.get(snapshotKey(bestKey.year, bestKey.semester)))
    : null;

  latestByTeamId = idToEntry.size ? idToEntry : null;
  if (!latestByTeamId?.size) rebuildLatestByTeamId();
}

export function getLatestFifaSnapshot(): FifaSnapshotKey | null {
  return latestSnapshot;
}

export function getLatestFifaDataSource(): string | null {
  return latestDataSource;
}

export function getMaxFifaPointsInLatestSnapshot(): number | null {
  if (!latestByTeam?.size) return null;
  let max = 0;
  for (const entry of latestByTeam.values()) {
    if (entry.points > max) max = entry.points;
  }
  return max > 0 ? max : null;
}

export function getTopFifaTeamInLatestSnapshot(): FifaRankingEntry | null {
  if (!latestByTeam?.size) return null;
  let top: FifaRankingEntry | null = null;
  for (const entry of latestByTeam.values()) {
    if (!top || entry.rank < top.rank) top = entry;
  }
  return top;
}

export function getLatestFifaRankingForTeam(teamName: string): FifaRankingEntry | null {
  if (!latestByTeam) return null;
  const key = normalizeFifaDatasetTeamName(teamName);
  return latestByTeam.get(key) ?? null;
}

export function getLatestFifaRankingForTeamId(
  teamId: number,
  teamName?: string
): FifaRankingEntry | null {
  if (latestByTeamId?.has(teamId)) {
    return latestByTeamId.get(teamId) ?? null;
  }
  if (!teamName?.trim() || !latestByTeam) return null;
  return getLatestFifaRankingForTeam(teamName);
}

export function getFifaRankingAtDate(
  teamName: string,
  isoDate: string
): (FifaRankingEntry & { snapshot: FifaSnapshotKey }) | null {
  if (!snapshotIndex?.size) return null;
  const normalized = normalizeFifaDatasetTeamName(teamName);
  const target = resolveFifaSnapshotForDate(isoDate);
  const picked = pickSnapshotKey(target, snapshotIndex);
  if (!picked) return null;
  const entry = snapshotIndex.get(snapshotKey(picked.year, picked.semester))?.get(normalized);
  if (!entry) return null;
  return { ...entry, snapshot: picked };
}

export function isTop20FifaRank(rank: number): boolean {
  return rank > 0 && rank <= 20;
}

export function formatFifaSnapshotLabel(
  snapshot: FifaSnapshotKey,
  dataSource?: string | null
): string {
  const half = snapshot.semester === 1 ? "H1" : "H2";
  const base = `${snapshot.year} ${half}`;
  const source = dataSource ?? latestDataSource;
  if (source === "sofascore") return `${base} · Sofascore`;
  if (source === "kaggle") return `${base} · Kaggle`;
  return base;
}

/** Clear in-memory cache (tests). */
export function resetFifaRankingsCache(): void {
  loadPromise = null;
  snapshotIndex = null;
  snapshotMeta = null;
  latestSnapshot = null;
  latestDataSource = null;
  latestByTeam = null;
  latestByTeamId = null;
}

export function lookupNormalizedOpponentName(opponent: string): string {
  return normalizeFifaDatasetTeamName(opponent);
}

export function normalizeTeamKeyForFifa(name: string): string {
  return normalizeNationalTeamName(normalizeFifaDatasetTeamName(name));
}
