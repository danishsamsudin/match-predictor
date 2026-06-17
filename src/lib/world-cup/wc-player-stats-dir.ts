import fs from "node:fs";
import path from "node:path";

export const WC_PLAYER_STATS_ROOT = path.join(
  process.cwd(),
  "data",
  "world-cup-2026",
  "WC-Opta-Player-Stats"
);

export const WC_PLAYER_STATS_SUBDIRS = {
  matchSummary: "Match Summary",
  optaSummary: "Opta Summary",
  matchDetails: "Match Details",
} as const;

export type WcPlayerStatsPageKind = keyof typeof WC_PLAYER_STATS_SUBDIRS;

export interface WcPlayerStatsFixtureFiles {
  fixtureKey: string;
  homeName: string;
  awayName: string;
  matchDate: string | null;
  matchSummary: string | null;
  optaSummary: string | null;
  matchDetails: string | null;
}

const FIXTURE_FILENAME_RE =
  /^(.+?)\s+vs\s+(.+?)\s+-\s+(\d{1,2}\s+\w{3}\s+\d{4})/i;

export function expectedOptaHtmlFilesDir(htmlPath: string): string {
  return htmlPath.replace(/\.html$/i, "_files");
}

export function assertPlayerStatsHtmlBundle(htmlPath: string): void {
  const filesDir = expectedOptaHtmlFilesDir(htmlPath);
  if (fs.existsSync(filesDir)) return;
  throw new Error(
    [
      `Missing _files folder for ${path.basename(htmlPath)}.`,
      `Expected: ${filesDir}`,
      "Save each Betting Showcase page as Web Page, Complete.",
    ].join("\n")
  );
}

function parseFixtureFromFilename(filename: string): {
  homeName: string;
  awayName: string;
  matchDate: string | null;
  fixtureKey: string;
} | null {
  const base = filename.replace(/\.html$/i, "").replace(/ - FIFA World Cup.*$/i, "");
  const m = base.match(FIXTURE_FILENAME_RE);
  if (!m) return null;

  const homeName = m[1].trim();
  const awayName = m[2].trim();
  const dateRaw = m[3].trim();
  const parsed = new Date(dateRaw);
  const matchDate = Number.isNaN(parsed.getTime())
    ? null
    : parsed.toISOString().slice(0, 10);
  const fixtureKey = `${normalizeFixtureTeam(homeName)}|${normalizeFixtureTeam(awayName)}|${matchDate ?? dateRaw}`;
  return { homeName, awayName, matchDate, fixtureKey };
}

function normalizeFixtureTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function listHtmlInSubdir(subdir: string): string[] {
  const dir = path.join(WC_PLAYER_STATS_ROOT, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".html"))
    .map((e) => path.join(dir, e.name));
}

export function listWcPlayerStatsFixtures(): WcPlayerStatsFixtureFiles[] {
  const byKey = new Map<string, WcPlayerStatsFixtureFiles>();

  const addFile = (kind: WcPlayerStatsPageKind, filePath: string) => {
    const meta = parseFixtureFromFilename(path.basename(filePath));
    if (!meta) return;
    let entry = byKey.get(meta.fixtureKey);
    if (!entry) {
      entry = {
        fixtureKey: meta.fixtureKey,
        homeName: meta.homeName,
        awayName: meta.awayName,
        matchDate: meta.matchDate,
        matchSummary: null,
        optaSummary: null,
        matchDetails: null,
      };
      byKey.set(meta.fixtureKey, entry);
    }
    if (kind === "matchSummary") entry.matchSummary = filePath;
    else if (kind === "optaSummary") entry.optaSummary = filePath;
    else entry.matchDetails = filePath;
  };

  for (const [kind, subdir] of Object.entries(WC_PLAYER_STATS_SUBDIRS)) {
    for (const file of listHtmlInSubdir(subdir)) {
      addFile(kind as WcPlayerStatsPageKind, file);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    (a.matchDate ?? "").localeCompare(b.matchDate ?? "")
  );
}
