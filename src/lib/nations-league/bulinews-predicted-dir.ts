import fs from "node:fs";
import path from "node:path";

/** Local BuliNews predicted-lineup HTML saves for NL 2026/27 (optional at runtime). */
export const NL_BULINEWS_PREDICTED_DIR = path.join(
  process.cwd(),
  "data",
  "nations-league-2026",
  "NL Bulin Predicted Starting"
);

export function listBulinewsPredictedHtmlFiles(
  dir = NL_BULINEWS_PREDICTED_DIR
): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".html") &&
        !entry.name.startsWith(".")
    )
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}
