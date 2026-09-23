import fs from "node:fs";
import path from "node:path";

/** Local Opta Analyst HTML saves for NL 2026/27 post-match ingest (gitignored; not required at runtime). */
export const NL_OPTA_RESULTS_DIR = path.join(
  process.cwd(),
  "data",
  "nations-league-2026",
  "NL-Opta-Results"
);

/** Small committed HTML snippets for parser/calibration tests (reuse WC fixtures when shared). */
export const NL_OPTA_HTML_FIXTURES_DIR = path.join(
  process.cwd(),
  "src",
  "lib",
  "nations-league",
  "__fixtures__",
  "opta-html"
);

/** Browser save companion folder (article.html → article_files/). */
export function expectedOptaFilesDir(htmlPath: string): string {
  return htmlPath.replace(/\.html$/i, "_files");
}

export function assertOptaHtmlBundle(htmlPath: string): void {
  const filesDir = expectedOptaFilesDir(htmlPath);
  if (fs.existsSync(filesDir)) return;

  throw new Error(
    [
      `Missing Opta _files folder for ${path.basename(htmlPath)}.`,
      `Expected: ${filesDir}`,
      "When saving from the browser, copy both the .html file and its _files folder into NL-Opta-Results.",
    ].join("\n")
  );
}

export function listNlOptaResultHtmlFiles(dir = NL_OPTA_RESULTS_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

export function listNlOptaHtmlFixtureFiles(
  dir = NL_OPTA_HTML_FIXTURES_DIR
): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}
