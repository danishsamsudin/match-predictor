/**
 * Print the plain-language Nations League post-match summary.
 *
 * Usage: npx tsx scripts/nl-post-match-report.ts
 */
import fs from "node:fs";
import path from "node:path";
import { buildNlPostMatchSummary, type NlPostMatchRunFacts } from "../src/lib/nations-league/build-nl-post-match-summary";
import { tryCreateServiceClient } from "../src/lib/supabase";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

function loadFacts(): NlPostMatchRunFacts {
  const p = path.join(process.cwd(), "data/reports/nl-last-run.json");
  const fallback: NlPostMatchRunFacts = {
    articlesIngested: 0,
    playerStatsIngested: 0,
    playerStatsSkipped: 0,
    scoresMarkedFinished: 0,
    nationsRated: 54,
    locksNew: 0,
    locksRefreshed: 0,
    locksFrozen: 0,
    matchEvals: 0,
    playerLines: 0,
  };
  if (!fs.existsSync(p)) return fallback;
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(p, "utf8")) };
  } catch {
    return fallback;
  }
}

async function main() {
  loadEnvLocal();
  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
  const summary = await buildNlPostMatchSummary(supabase, loadFacts());
  console.log(summary);

  const outDir = path.join(process.cwd(), "data/reports");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  fs.writeFileSync(path.join(outDir, `nl-post-match-${stamp}.md`), `${summary}\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
