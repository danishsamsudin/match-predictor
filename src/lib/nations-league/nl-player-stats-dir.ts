import fs from "node:fs";
import path from "node:path";

/** Local Betting Showcase HTML saves for NL player-stats ingest (gitignored; not required at runtime). */
export const NL_PLAYER_STATS_ROOT = path.join(
  process.cwd(),
  "data",
  "nations-league-2026",
  "NL-Opta-Player-Stats"
);

/** Committed parser test fixtures (optional; can reuse WC samples). */
export const NL_PLAYER_STATS_FIXTURES_ROOT = path.join(
  process.cwd(),
  "src",
  "lib",
  "nations-league",
  "__fixtures__",
  "opta-player-stats"
);

export const NL_PLAYER_STATS_SUBDIRS = {
  matchSummary: "Match Summary",
  optaSummary: "Opta Summary",
  matchDetails: "Match Details",
} as const;

export type NlPlayerStatsPageKind = keyof typeof NL_PLAYER_STATS_SUBDIRS;

export type DetectedNlPlayerStatsPageKind = NlPlayerStatsPageKind | "unknown";

export interface NlPlayerStatsFixtureFiles {
  fixtureKey: string;
  homeName: string;
  awayName: string;
  matchDate: string | null;
  matchSummary: string | null;
  optaSummary: string | null;
  matchDetails: string | null;
}

export interface NlPlayerStatsIncompleteFixture {
  fixtureKey: string;
  homeName: string;
  awayName: string;
  matchDate: string | null;
  missing: NlPlayerStatsPageKind[];
  present: NlPlayerStatsPageKind[];
}

export interface NlPlayerStatsDuplicateGroup {
  fixtureKey: string;
  homeName: string;
  awayName: string;
  matchDate: string | null;
  kind: NlPlayerStatsPageKind;
  folder: string;
  files: string[];
}

export interface NlPlayerStatsMisplacedFile {
  filePath: string;
  folderKind: NlPlayerStatsPageKind;
  folderLabel: string;
  detectedKind: DetectedNlPlayerStatsPageKind;
  expectedFolder: string | null;
}

export interface NlPlayerStatsMissingBundle {
  filePath: string;
  expectedFilesDir: string;
}

export interface NlPlayerStatsAudit {
  fixtures: NlPlayerStatsFixtureFiles[];
  htmlCounts: {
    matchSummary: number;
    optaSummary: number;
    matchDetails: number;
  };
  unparsed: string[];
  incomplete: NlPlayerStatsIncompleteFixture[];
  duplicates: NlPlayerStatsDuplicateGroup[];
  misplaced: NlPlayerStatsMisplacedFile[];
  missingBundles: NlPlayerStatsMissingBundle[];
  completeCount: number;
  /** True when every discovered issue list is empty. */
  ok: boolean;
}

const PAGE_KIND_LABEL: Record<NlPlayerStatsPageKind, string> = {
  matchSummary: "Match Summary",
  optaSummary: "Opta Summary",
  matchDetails: "Match Details",
};

const ALL_PAGE_KINDS = Object.keys(NL_PLAYER_STATS_SUBDIRS) as NlPlayerStatsPageKind[];

/** Accepts Sep / Sept / September (Opta filenames often use “Sept”). */
const FIXTURE_FILENAME_RE =
  /^(.+?)\s+vs\s+(.+?)\s+-\s+(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/i;

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

/** Local calendar date so midnight local times do not shift a day via UTC. */
function parseFilenameDate(dateRaw: string): string | null {
  const parsed = new Date(dateRaw);
  if (Number.isNaN(parsed.getTime())) return null;
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, "0");
  const d = String(parsed.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function parseNlPlayerStatsFixtureFromFilename(filename: string): {
  homeName: string;
  awayName: string;
  matchDate: string | null;
  fixtureKey: string;
} | null {
  const base = filename
    .replace(/\.html$/i, "")
    .replace(/ - UEFA Nations League.*$/i, "")
    .replace(/ - Nations League.*$/i, "")
    .replace(/ - FIFA World Cup.*$/i, "")
    .replace(/ - Betting Showcase.*$/i, "");
  const m = base.match(FIXTURE_FILENAME_RE);
  if (!m) return null;

  const homeName = m[1].trim();
  const awayName = m[2].trim();
  const dateRaw = m[3].trim();
  const matchDate = parseFilenameDate(dateRaw);
  const fixtureKey = `${normalizeFixtureTeam(homeName)}|${normalizeFixtureTeam(awayName)}|${matchDate ?? dateRaw}`;
  return { homeName, awayName, matchDate, fixtureKey };
}

/**
 * Infer which Betting Showcase page an HTML save actually is, from Opta widget
 * markers. Used to catch files saved into the wrong folder.
 */
export function detectNlPlayerStatsPageKind(
  html: string
): DetectedNlPlayerStatsPageKind {
  const hasPlayerstatsMatch = /<playerstats-match[\s\S]*?>/i.test(html);
  const hasOptContainer = /Opta_F_OPT_container/i.test(html);
  const hasMpContainer = /Opta_F_MP_container/i.test(html);
  const hasPoints = /Opta-Stat-points/i.test(html);
  const hasExpectedGoals = /Opta-Stat-expectedGoals/i.test(html);

  if (hasPlayerstatsMatch || (hasExpectedGoals && !hasPoints)) {
    return "matchDetails";
  }
  if (hasOptContainer || hasPoints) return "optaSummary";
  if (hasMpContainer) return "matchSummary";
  return "unknown";
}

/** HTML files present under the three Betting Showcase subdirs that failed name parsing. */
export function listUnparsedNlPlayerStatsHtml(
  root = NL_PLAYER_STATS_ROOT
): string[] {
  const unparsed: string[] = [];
  for (const subdir of Object.values(NL_PLAYER_STATS_SUBDIRS)) {
    for (const file of listHtmlInSubdir(root, subdir)) {
      if (!parseNlPlayerStatsFixtureFromFilename(path.basename(file))) {
        unparsed.push(file);
      }
    }
  }
  return unparsed;
}

function pagePathForKind(
  fixture: NlPlayerStatsFixtureFiles,
  kind: NlPlayerStatsPageKind
): string | null {
  if (kind === "matchSummary") return fixture.matchSummary;
  if (kind === "optaSummary") return fixture.optaSummary;
  return fixture.matchDetails;
}

/**
 * Full disk audit: incomplete three-page sets, duplicate saves for the same
 * fixture in one folder, pages in the wrong folder, and missing `_files` bundles.
 */
export function auditNlPlayerStatsDir(
  root = NL_PLAYER_STATS_ROOT
): NlPlayerStatsAudit {
  const filesByKind = new Map<NlPlayerStatsPageKind, string[]>();
  for (const kind of ALL_PAGE_KINDS) {
    filesByKind.set(kind, listHtmlInSubdir(root, NL_PLAYER_STATS_SUBDIRS[kind]));
  }

  const htmlCounts = {
    matchSummary: filesByKind.get("matchSummary")!.length,
    optaSummary: filesByKind.get("optaSummary")!.length,
    matchDetails: filesByKind.get("matchDetails")!.length,
  };

  const unparsed: string[] = [];
  const duplicates: NlPlayerStatsDuplicateGroup[] = [];
  const byKey = new Map<
    string,
    {
      homeName: string;
      awayName: string;
      matchDate: string | null;
      paths: Partial<Record<NlPlayerStatsPageKind, string[]>>;
    }
  >();

  for (const kind of ALL_PAGE_KINDS) {
    for (const filePath of filesByKind.get(kind)!) {
      const meta = parseNlPlayerStatsFixtureFromFilename(path.basename(filePath));
      if (!meta) {
        unparsed.push(filePath);
        continue;
      }
      let entry = byKey.get(meta.fixtureKey);
      if (!entry) {
        entry = {
          homeName: meta.homeName,
          awayName: meta.awayName,
          matchDate: meta.matchDate,
          paths: {},
        };
        byKey.set(meta.fixtureKey, entry);
      }
      const list = entry.paths[kind] ?? [];
      list.push(filePath);
      entry.paths[kind] = list;
    }
  }

  for (const [fixtureKey, entry] of byKey) {
    for (const kind of ALL_PAGE_KINDS) {
      const list = entry.paths[kind] ?? [];
      if (list.length > 1) {
        duplicates.push({
          fixtureKey,
          homeName: entry.homeName,
          awayName: entry.awayName,
          matchDate: entry.matchDate,
          kind,
          folder: NL_PLAYER_STATS_SUBDIRS[kind],
          files: list,
        });
      }
    }
  }

  const fixtures: NlPlayerStatsFixtureFiles[] = [...byKey.entries()]
    .map(([fixtureKey, entry]) => ({
      fixtureKey,
      homeName: entry.homeName,
      awayName: entry.awayName,
      matchDate: entry.matchDate,
      // Last file wins (same as listNlPlayerStatsFixtures); duplicates are reported separately.
      matchSummary: entry.paths.matchSummary?.at(-1) ?? null,
      optaSummary: entry.paths.optaSummary?.at(-1) ?? null,
      matchDetails: entry.paths.matchDetails?.at(-1) ?? null,
    }))
    .sort((a, b) => (a.matchDate ?? "").localeCompare(b.matchDate ?? ""));

  const incomplete: NlPlayerStatsIncompleteFixture[] = [];
  for (const fixture of fixtures) {
    const missing = ALL_PAGE_KINDS.filter((kind) => !pagePathForKind(fixture, kind));
    if (!missing.length) continue;
    incomplete.push({
      fixtureKey: fixture.fixtureKey,
      homeName: fixture.homeName,
      awayName: fixture.awayName,
      matchDate: fixture.matchDate,
      missing,
      present: ALL_PAGE_KINDS.filter((kind) => !!pagePathForKind(fixture, kind)),
    });
  }

  const misplaced: NlPlayerStatsMisplacedFile[] = [];
  const missingBundles: NlPlayerStatsMissingBundle[] = [];
  for (const kind of ALL_PAGE_KINDS) {
    for (const filePath of filesByKind.get(kind)!) {
      const filesDir = expectedOptaHtmlFilesDir(filePath);
      if (!fs.existsSync(filesDir)) {
        missingBundles.push({ filePath, expectedFilesDir: filesDir });
      }

      let html = "";
      try {
        html = fs.readFileSync(filePath, "utf8");
      } catch {
        misplaced.push({
          filePath,
          folderKind: kind,
          folderLabel: NL_PLAYER_STATS_SUBDIRS[kind],
          detectedKind: "unknown",
          expectedFolder: null,
        });
        continue;
      }

      const detected = detectNlPlayerStatsPageKind(html);
      if (detected === kind) continue;
      misplaced.push({
        filePath,
        folderKind: kind,
        folderLabel: NL_PLAYER_STATS_SUBDIRS[kind],
        detectedKind: detected,
        expectedFolder:
          detected === "unknown" ? null : NL_PLAYER_STATS_SUBDIRS[detected],
      });
    }
  }

  const completeCount = fixtures.length - incomplete.length;
  const ok =
    unparsed.length === 0 &&
    incomplete.length === 0 &&
    duplicates.length === 0 &&
    misplaced.length === 0 &&
    missingBundles.length === 0;

  return {
    fixtures,
    htmlCounts,
    unparsed,
    incomplete,
    duplicates,
    misplaced,
    missingBundles,
    completeCount,
    ok,
  };
}

export function summarizeNlPlayerStatsDir(root = NL_PLAYER_STATS_ROOT): {
  fixtures: NlPlayerStatsFixtureFiles[];
  htmlCounts: { matchSummary: number; optaSummary: number; matchDetails: number };
  unparsed: string[];
  incomplete: NlPlayerStatsIncompleteFixture[];
  duplicates: NlPlayerStatsDuplicateGroup[];
  misplaced: NlPlayerStatsMisplacedFile[];
  missingBundles: NlPlayerStatsMissingBundle[];
  completeCount: number;
  ok: boolean;
} {
  const audit = auditNlPlayerStatsDir(root);
  return {
    fixtures: audit.fixtures,
    htmlCounts: audit.htmlCounts,
    unparsed: audit.unparsed,
    incomplete: audit.incomplete,
    duplicates: audit.duplicates,
    misplaced: audit.misplaced,
    missingBundles: audit.missingBundles,
    completeCount: audit.completeCount,
    ok: audit.ok,
  };
}

function shortPlayerStatsPath(filePath: string, root: string): string {
  const rel = path.relative(root, filePath);
  if (rel && !rel.startsWith("..")) return rel;
  return `${path.basename(path.dirname(filePath))}/${path.basename(filePath)}`;
}

/** Human-readable console lines for the player-stats disk audit. */
export function formatNlPlayerStatsAuditReport(
  audit: NlPlayerStatsAudit,
  root = NL_PLAYER_STATS_ROOT
): string[] {
  const lines: string[] = [];
  const totalHtml =
    audit.htmlCounts.matchSummary +
    audit.htmlCounts.optaSummary +
    audit.htmlCounts.matchDetails;

  lines.push(
    `Player-stats audit: ${audit.completeCount}/${audit.fixtures.length} fixture(s) have all three pages ` +
      `(MS ${audit.htmlCounts.matchSummary} / OS ${audit.htmlCounts.optaSummary} / MD ${audit.htmlCounts.matchDetails}, ${totalHtml} HTML files)`
  );

  if (audit.ok) {
    lines.push("Player-stats audit OK - no missing pages, duplicates, or wrong-folder files.");
    return lines;
  }

  if (audit.incomplete.length) {
    lines.push(
      `MISSING pages (${audit.incomplete.length} fixture(s) incomplete - need Match Summary + Opta Summary + Match Details):`
    );
    for (const item of audit.incomplete) {
      const miss = item.missing.map((k) => PAGE_KIND_LABEL[k]).join(", ");
      const have = item.present.map((k) => PAGE_KIND_LABEL[k]).join(", ");
      lines.push(
        `  • ${item.homeName} vs ${item.awayName} (${item.matchDate ?? "?"}) - missing: ${miss}` +
          (have ? ` (have: ${have})` : "")
      );
    }
  }

  if (audit.duplicates.length) {
    lines.push(
      `DUPLICATES (${audit.duplicates.length} fixture/folder group(s) with more than one HTML file):`
    );
    for (const dup of audit.duplicates) {
      lines.push(
        `  • ${dup.homeName} vs ${dup.awayName} (${dup.matchDate ?? "?"}) in ${dup.folder}:`
      );
      for (const file of dup.files) {
        lines.push(`      - ${path.basename(file)}`);
      }
    }
  }

  if (audit.misplaced.length) {
    lines.push(
      `WRONG FOLDER (${audit.misplaced.length} HTML file(s) whose content does not match the folder):`
    );
    for (const item of audit.misplaced) {
      const detected =
        item.detectedKind === "unknown"
          ? "unknown page type"
          : PAGE_KIND_LABEL[item.detectedKind];
      const moveTo = item.expectedFolder
        ? ` - should be in ${item.expectedFolder}`
        : "";
      lines.push(
        `  • ${shortPlayerStatsPath(item.filePath, root)} is in ${item.folderLabel} but looks like ${detected}${moveTo}`
      );
    }
  }

  if (audit.missingBundles.length) {
    lines.push(
      `MISSING _files bundles (${audit.missingBundles.length}) - save as Web Page, Complete:`
    );
    for (const item of audit.missingBundles) {
      lines.push(`  • ${shortPlayerStatsPath(item.filePath, root)}`);
    }
  }

  if (audit.unparsed.length) {
    lines.push(
      `UNPARSED filenames (${audit.unparsed.length}) - expected "{Home} vs {Away} - {DD Mon YYYY} - ...":`
    );
    for (const file of audit.unparsed) {
      lines.push(`  • ${shortPlayerStatsPath(file, root)}`);
    }
  }

  return lines;
}

/** Print audit report; returns false when the pipeline should stop. */
export function reportNlPlayerStatsAudit(
  root = NL_PLAYER_STATS_ROOT,
  options?: { abortOnIssues?: boolean }
): NlPlayerStatsAudit {
  const audit = auditNlPlayerStatsDir(root);
  const lines = formatNlPlayerStatsAuditReport(audit, root);
  for (const line of lines) {
    if (audit.ok || line.startsWith("Player-stats audit:")) {
      console.log(line);
    } else {
      console.warn(line);
    }
  }

  const abortOnIssues = options?.abortOnIssues !== false;
  if (!audit.ok && abortOnIssues) {
    console.error(
      "\nFix the player-stats folder issues above, then re-run. " +
        "Each match needs exactly one Match Summary, one Opta Summary, and one Match Details HTML (plus each `_files` folder)."
    );
  }
  return audit;
}

function normalizeFixtureTeam(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function listHtmlInSubdir(root: string, subdir: string): string[] {
  const dir = path.join(root, subdir);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.toLowerCase().endsWith(".html"))
    .map((e) => path.join(dir, e.name));
}

export function listNlPlayerStatsFixtures(
  root = NL_PLAYER_STATS_ROOT
): NlPlayerStatsFixtureFiles[] {
  const byKey = new Map<string, NlPlayerStatsFixtureFiles>();

  const addFile = (kind: NlPlayerStatsPageKind, filePath: string) => {
    const meta = parseNlPlayerStatsFixtureFromFilename(path.basename(filePath));
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

  for (const [kind, subdir] of Object.entries(NL_PLAYER_STATS_SUBDIRS)) {
    for (const file of listHtmlInSubdir(root, subdir)) {
      addFile(kind as NlPlayerStatsPageKind, file);
    }
  }

  return [...byKey.values()].sort((a, b) =>
    (a.matchDate ?? "").localeCompare(b.matchDate ?? "")
  );
}
