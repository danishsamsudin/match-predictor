import { pickColumn, type ParsedScoutlystExport } from "@/lib/scoutlyst/parse-scoutlyst-export";
import { normalizeText } from "@/lib/soccerdata/normalize";

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

const CORE_SUFFIXES = new Set([
  "Name",
  "Team",
  "League",
  "POS",
  "Age",
  "PPM",
  "Value",
  "Salary",
]);

function parseNum(raw: string | undefined): number | null {
  if (!raw || raw === "-") return null;
  const cleaned = raw.replace(/[€%kb\s]/gi, "").replace(",", ".");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Parse Scoutlyst/Transfermarkt-style market values (€m, €k, plain EUR). */
export function parseMarketValueEur(raw: string | undefined): number | null {
  if (!raw || raw === "-") return null;
  const lower = raw.toLowerCase().trim();
  const multiplier = lower.includes("m") ? 1_000_000 : lower.includes("k") ? 1_000 : 1;
  const n = parseNum(raw);
  if (n == null) return null;
  return Math.round(n * multiplier * 100) / 100;
}

export function mapScoutlystExportRow(
  row: Record<string, string>,
  columnKeys: string[],
  referenceLeagueId?: number
): MappedScoutlystRow | null {
  const player_name = pickColumn(row, columnKeys, "Name");
  if (!player_name) return null;

  const team_name = pickColumn(row, columnKeys, "Team") ?? null;
  const league_name = pickColumn(row, columnKeys, "League") ?? null;
  const position = pickColumn(row, columnKeys, "POS") ?? null;
  const age = parseNum(pickColumn(row, columnKeys, "Age"));

  const ppm = pickColumn(row, columnKeys, "PPM");
  const rating = parseNum(ppm);
  const market_value_eur = parseMarketValueEur(pickColumn(row, columnKeys, "Value"));
  const salary_eur = parseMarketValueEur(pickColumn(row, columnKeys, "Salary"));

  const leaguePart = referenceLeagueId != null ? String(referenceLeagueId) : "na";
  const scoutlyst_player_key = `${leaguePart}:${normalizeText(player_name)}:${team_name ? normalizeText(team_name) : "unknown"}`;

  const stats: Record<string, string | number | null> = {};
  for (const key of columnKeys) {
    const short = key.includes(" — ") ? key.split(" — ").pop()! : key;
    if (CORE_SUFFIXES.has(short)) continue;
    const raw = row[key]?.trim();
    if (!raw || raw === "-") continue;
    const asNum = parseNum(raw);
    stats[key] = asNum != null ? asNum : raw;
  }

  return {
    scoutlyst_player_key,
    player_name,
    team_name,
    league_name,
    position,
    age,
    rating,
    market_value_eur,
    salary_eur,
    stats,
  };
}

export function resolveSnapshotDateFromExport(
  parsed: Pick<ParsedScoutlystExport, "exportedAt">,
  fileName?: string,
  fallback?: string
): string {
  if (parsed.exportedAt) return parsed.exportedAt;
  if (fallback?.trim()) return fallback.trim().slice(0, 10);
  const fromName = fileName?.match(/(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];
  return new Date().toISOString().slice(0, 10);
}
