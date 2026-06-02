/**
 * Fetch and store lineups for finished events missing synced_event_lineups.
 * Usage: npx tsx scripts/backfill-event-lineups.ts [leagueId] [limit]
 */
import fs from "fs";
import path from "path";
import { gatewayGetMatchLineups } from "../src/lib/api/football-gateway";
import { createServiceClient } from "../src/lib/supabase";
import type { SportApiEvent } from "../src/lib/types/sportapi";

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
  const leagueId = Number(process.argv[2]) || 39;
  const limit = Number(process.argv[3]) || 25;
  const supabase = createServiceClient();

  const { data: existing } = await supabase.from("synced_event_lineups").select("event_id");
  const hasLineup = new Set((existing ?? []).map((r) => r.event_id));

  const { data: events } = await supabase
    .from("synced_events")
    .select("event_id, payload, kickoff_at")
    .eq("reference_league_id", leagueId)
    .order("kickoff_at", { ascending: false })
    .limit(400);

  const candidates: Array<{ eventId: number; event: SportApiEvent }> = [];
  for (const row of events ?? []) {
    if (hasLineup.has(row.event_id)) continue;
    const event = row.payload as SportApiEvent;
    const status = event?.status?.type;
    if (status !== "finished" && status !== "ended") continue;
    if (!event?.homeTeam?.id || !event?.awayTeam?.id) continue;
    candidates.push({ eventId: row.event_id, event });
    if (candidates.length >= limit) break;
  }

  console.log(`Backfilling up to ${candidates.length} lineups for league ${leagueId}...`);

  let ok = 0;
  let failed = 0;
  const now = new Date().toISOString();

  for (const { eventId } of candidates) {
    try {
      const { data: lineupsRes } = await gatewayGetMatchLineups(eventId);
      const homeCount = lineupsRes.home?.players?.length ?? 0;
      const awayCount = lineupsRes.away?.players?.length ?? 0;
      if (!homeCount && !awayCount) {
        console.warn(`  skip ${eventId}: empty lineup response`);
        failed++;
        continue;
      }
      await supabase.from("synced_event_lineups").upsert({
        event_id: eventId,
        payload: lineupsRes,
        confirmed: lineupsRes.confirmed ?? null,
        synced_at: now,
      });
      ok++;
      console.log(`  ok ${eventId} (${homeCount}+${awayCount} players)`);
    } catch (e) {
      failed++;
      console.warn(`  fail ${eventId}:`, e instanceof Error ? e.message : e);
    }
  }

  console.log(`Done. stored=${ok} failed=${failed}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
