/**
 * Writes data/world-cup-2026-groups.json from the canonical draw in group-draw.ts / JSON.
 * npx tsx scripts/seed-world-cup-groups-json.ts
 */

import fs from "node:fs";
import path from "node:path";
import { loadGroupDraw } from "../src/lib/world-cup/group-draw";

function main() {
  const groups = loadGroupDraw();

  const payload = {
    version: "fifa-draw-2026-official",
    note: "Official FIFA 2026 group stage draw (edit data/world-cup-2026-groups.json directly)",
    groups,
  };

  const out = path.join(process.cwd(), "data/world-cup-2026-groups.json");
  fs.writeFileSync(out, JSON.stringify(payload, null, 2));
  console.log("Wrote", out);
}

main();
