import { normalizeText } from "@/lib/soccerdata/normalize";

const HEADER_ALIASES: Record<string, string[]> = {
  scoutlyst_player_key: ["id", "player_id", "player id", "scoutlyst_id", "scoutlyst id"],
  player_name: ["name", "player", "player_name", "player name", "full_name", "full name"],
  team_name: ["team", "club", "team_name", "team name", "current_team", "current team"],
  league_name: ["league", "competition", "league_name", "league name"],
  position: ["position", "pos", "primary_position"],
  age: ["age"],
  rating: ["rating", "scoutlyst_rating", "performance_rating", "overall_rating", "score"],
};

function normalizeHeader(header: string): string {
  return header.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildHeaderIndex(headers: string[]): Map<string, string> {
  const index = new Map<string, string>();
  for (const raw of headers) {
    const norm = normalizeHeader(raw);
    index.set(norm, raw);
  }
  return index;
}

function pickField(
  row: Record<string, string>,
  headerIndex: Map<string, string>,
  field: keyof typeof HEADER_ALIASES
): string | undefined {
  for (const alias of HEADER_ALIASES[field]) {
    const rawKey = headerIndex.get(alias);
    if (!rawKey) continue;
    const value = row[rawKey]?.trim();
    if (value) return value;
  }
  return undefined;
}

export type MappedScoutlystRow = {
  scoutlyst_player_key: string;
  player_name: string;
  team_name: string | null;
  league_name: string | null;
  position: string | null;
  age: number | null;
  rating: number | null;
  market_value_eur: number | null;
  salary_eur: number | null;
  stats: Record<string, string | number | null>;
};

function usedRawKeys(headerIndex: Map<string, string>): Set<string> {
  const used = new Set<string>();
  for (const field of Object.keys(HEADER_ALIASES) as Array<keyof typeof HEADER_ALIASES>) {
    for (const alias of HEADER_ALIASES[field]) {
      const raw = headerIndex.get(alias);
      if (raw) used.add(raw);
    }
  }
  return used;
}

export function mapScoutlystRow(
  row: Record<string, string>,
  headers: string[]
): MappedScoutlystRow | null {
  const headerIndex = buildHeaderIndex(headers);
  const playerName = pickField(row, headerIndex, "player_name");
  if (!playerName) return null;

  const explicitKey = pickField(row, headerIndex, "scoutlyst_player_key");
  const teamName = pickField(row, headerIndex, "team_name") ?? null;
  const scoutlyst_player_key =
    explicitKey ??
    `${normalizeText(playerName)}:${teamName ? normalizeText(teamName) : "unknown"}`;

  const ageRaw = pickField(row, headerIndex, "age");
  const age = ageRaw != null && Number.isFinite(Number(ageRaw)) ? Number(ageRaw) : null;

  const ratingRaw = pickField(row, headerIndex, "rating");
  const rating =
    ratingRaw != null && Number.isFinite(Number(ratingRaw.replace(",", ".")))
      ? Number(ratingRaw.replace(",", "."))
      : null;

  const coreKeys = usedRawKeys(headerIndex);
  const stats: Record<string, string | number | null> = {};
  for (const header of headers) {
    if (coreKeys.has(header)) continue;
    const raw = row[header]?.trim();
    if (!raw) continue;
    const asNum = Number(raw.replace(",", "."));
    stats[header] = Number.isFinite(asNum) && raw !== "" ? asNum : raw;
  }

  return {
    scoutlyst_player_key,
    player_name: playerName,
    team_name: teamName,
    league_name: pickField(row, headerIndex, "league_name") ?? null,
    position: pickField(row, headerIndex, "position") ?? null,
    age,
    rating,
    market_value_eur: null,
    salary_eur: null,
    stats,
  };
}

export function resolveSnapshotDate(input?: string, fileName?: string): string {
  if (input?.trim()) return input.trim().slice(0, 10);

  const fromName = fileName?.match(/(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];

  const d = new Date();
  const day = d.getUTCDay();
  const diff = day === 0 ? 6 : day - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
