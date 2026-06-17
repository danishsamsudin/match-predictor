/**
 * Backfill national_match_process_metrics from synced_event_statistics payloads.
 *
 * Usage: npx tsx scripts/backfill-national-process-metrics.ts [maxRows]
 */
import { extractMatchProcessMetrics } from "../src/lib/api/sportapi/mappers";
import {
  buildProcessMetricsRowFromStats,
  upsertNationalMatchProcessMetrics,
} from "../src/lib/data/match-process-metrics";
import type { SportApiEvent, SportApiStatisticsResponse } from "../src/lib/types/sportapi";
import { createClient } from "@supabase/supabase-js";

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
  const maxRows = Number(process.argv[2] ?? 0);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env");

  const supabase = createClient(url, key);
  let offset = 0;
  let upserted = 0;
  let scanned = 0;

  while (true) {
    const { data: statsRows } = await supabase
      .from("synced_event_statistics")
      .select("event_id, payload")
      .range(offset, offset + 499);

    if (!statsRows?.length) break;

    for (const row of statsRows) {
      scanned += 1;
      if (maxRows > 0 && upserted >= maxRows) break;

      const payload = row.payload as SportApiStatisticsResponse;
      const metrics = extractMatchProcessMetrics(payload);
      if (
        metrics.homeXg == null &&
        metrics.awayXg == null &&
        metrics.homeShots == null &&
        metrics.awayShots == null
      ) {
        continue;
      }

      const { data: eventRow } = await supabase
        .from("synced_events")
        .select("payload")
        .eq("event_id", row.event_id)
        .maybeSingle();

      const event = eventRow?.payload as SportApiEvent | undefined;
      if (!event?.homeTeam?.id || !event?.awayTeam?.id) continue;

      const built = buildProcessMetricsRowFromStats(row.event_id, event, payload);
      if (!built) continue;
      await upsertNationalMatchProcessMetrics(supabase, built);
      upserted += 1;
    }

    if (maxRows > 0 && upserted >= maxRows) break;
    if (statsRows.length < 500) break;
    offset += 500;
  }

  console.log(`Scanned ${scanned} statistics rows, upserted ${upserted} process metrics.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
