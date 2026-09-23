/**
 * Fill league-phase predictions and refresh the NL hub snapshot.
 * Usage: npx tsx scripts/nl-refresh-hub.ts
 */
import { refreshNationsLeagueHubSnapshot } from "../src/lib/nations-league/hub-load";

function loadEnvLocal() {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
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

async function main() {
  loadEnvLocal();
  console.log("Starting NL hub refresh + prediction fill...");
  const payload = await refreshNationsLeagueHubSnapshot();
  const upcoming = payload?.upcoming ?? [];
  const withPred = upcoming.filter((m) => Boolean(m.prediction)).length;
  console.log(
    JSON.stringify(
      {
        updatedAt: payload?.updatedAt ?? null,
        groupCount: Object.keys(payload?.groupMatrix ?? {}).length,
        recent: payload?.recent?.length ?? 0,
        upcoming: upcoming.length,
        withPred,
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
