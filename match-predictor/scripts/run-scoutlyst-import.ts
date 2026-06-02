/**
 * One-shot Scoutlyst folder import (reads .env.local).
 * Usage: npx tsx scripts/run-scoutlyst-import.ts
 */
import fs from "fs";
import path from "path";
import { runScoutlystFolderImport } from "../src/lib/scoutlyst/run-folder-import";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq < 0) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const summary = await runScoutlystFolderImport({ replicateEuropean: true });
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.ok || summary.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
