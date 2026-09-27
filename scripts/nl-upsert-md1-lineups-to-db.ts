/**
 * Upsert scraped MD1 Sofascore lineups into synced_event_lineups.
 *   npx tsx scripts/nl-upsert-md1-lineups-to-db.ts
 */
import fs from "fs";
import path from "path";
import md1 from "../data/nations-league-2026/md1-starting-xis.json";
import { createServiceClient, hasServiceRoleKey } from "../src/lib/supabase";

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

type Player = {
  sofascorePlayerId: number;
  name: string;
  position: string | null;
  jerseyNumber: string | null;
  substitute: boolean;
};

type Side = {
  formation: string | null;
  starters: Player[];
  substitutes: Player[];
};

function toApiSide(side: Side) {
  const players = [...side.starters, ...side.substitutes].map((p) => ({
    player: {
      id: p.sofascorePlayerId,
      name: p.name,
      position: p.position ?? undefined,
      jerseyNumber: p.jerseyNumber ?? undefined,
    },
    substitute: p.substitute,
    position: p.position ?? undefined,
  }));
  return {
    players,
    formation: side.formation ?? undefined,
  };
}

async function main() {
  loadEnvLocal();
  if (!hasServiceRoleKey()) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY required");
  }
  const supabase = createServiceClient();
  const now = new Date().toISOString();
  const fixtures = (md1 as { fixtures: Array<{
    sofascoreEventId: number;
    home: Side;
    away: Side;
    confirmed: boolean | null;
  }> }).fixtures;

  let ok = 0;
  for (const fx of fixtures) {
    const payload = {
      confirmed: fx.confirmed ?? true,
      home: toApiSide(fx.home),
      away: toApiSide(fx.away),
    };
    const { error } = await supabase.from("synced_event_lineups").upsert({
      event_id: fx.sofascoreEventId,
      payload,
      confirmed: payload.confirmed,
      synced_at: now,
    });
    if (error) {
      console.warn(`fail ${fx.sofascoreEventId}: ${error.message}`);
      continue;
    }
    ok++;
  }
  console.log(`Upserted ${ok}/${fixtures.length} MD1 lineups into synced_event_lineups`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
