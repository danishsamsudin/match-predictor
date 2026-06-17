/**
 * Re-downloads corrupted local badges using API-Sports CDN with the correct
 * API-Football team id (matched by name), saved under SofaScore ids from the manifest.
 *
 * Run: npm run logos:repair
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const outDir = path.join(root, "public", "team-logos");
const repairMapPath = path.join(__dirname, "team-logo-api-repair.json");

function buildRepairMap() {
  const raw = JSON.parse(fs.readFileSync(repairMapPath, "utf8"));
  return new Map(Object.entries(raw).map(([sofaId, apiId]) => [Number(sofaId), Number(apiId)]));
}

async function downloadBytes(url) {
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok) return null;
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length < 200) return null;
  return buf;
}

async function main() {
  const repair = buildRepairMap();
  fs.mkdirSync(outDir, { recursive: true });

  let ok = 0;
  let fail = 0;

  for (const [sofaId, apiId] of repair.entries()) {
    const url = `https://media.api-sports.io/football/teams/${apiId}.png`;
    const buf = await downloadBytes(url);
    const dest = path.join(outDir, `${sofaId}.png`);
    if (!buf) {
      fail++;
      process.stdout.write(`✗ sofa ${sofaId} ← api ${apiId}\n`);
      continue;
    }
    fs.writeFileSync(dest, buf);
    ok++;
    process.stdout.write(`✓ sofa ${sofaId} ← api ${apiId}\n`);
    await new Promise((r) => setTimeout(r, 40));
  }

  console.log(`\nRepaired ${ok} logos, ${fail} failed (${repair.size} mapped teams).`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
