/**
 * Run World Cup hub sync directly (no dev server required).
 *
 * Usage: npx tsx scripts/wc-sync-cli.ts
 */
import { runWorldCupHubRefresh } from "../src/lib/world-cup/hub-refresh";

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
  console.log("==> World Cup hub sync (direct)");
  const result = await runWorldCupHubRefresh("manual");
  console.log(JSON.stringify(result));
  if (!result.ok) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
