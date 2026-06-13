import fs from "node:fs";
import path from "node:path";

/** Committed Opta Analyst HTML articles for WC 2026 post-match ingest. */
export const WC_OPTA_RESULTS_DIR = path.join(
  process.cwd(),
  "data",
  "world-cup-2026",
  "WC-Opta-Results"
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
      "When saving from the browser, copy both the .html file and its _files folder into WC-Opta-Results.",
    ].join("\n")
  );
}

export function listWcOptaResultHtmlFiles(dir = WC_OPTA_RESULTS_DIR): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".html"))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}
