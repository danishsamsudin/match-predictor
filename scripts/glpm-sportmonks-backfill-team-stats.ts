/**
 * Re-map glpm_match_team_stats from stored SportMonks payloads (no API calls).
 * Use after adding new SM proxies (PPDA, build-up, pressing) or with --skip-backfill.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-backfill-team-stats.ts <seasonId>
 */
import fs from "node:fs";
import path from "node:path";
import {
  mapSportmonksTeamStats,
  resolveParticipants,
} from "../src/lib/glpm/layer1/sportmonks/upsertFixture";
import { tryCreateServiceClient } from "../src/lib/supabase";
import type { SmFixture } from "../src/lib/sportmonks/types";

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

async function main() {
  loadEnvLocal();
  const seasonArg = process.argv.slice(2).find((a) => !a.startsWith("-"));
  if (!seasonArg) {
    console.error("Usage: npx tsx scripts/glpm-sportmonks-backfill-team-stats.ts <seasonId>");
    process.exit(1);
  }
  const seasonId = Number(seasonArg);
  if (!Number.isFinite(seasonId)) {
    console.error(`Invalid seasonId: ${seasonArg}`);
    process.exit(1);
  }

  const supabase = tryCreateServiceClient();
  if (!supabase) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  const { data: matches, error: matchErr } = await supabase
    .from("glpm_matches")
    .select("sm_id, status")
    .eq("season_id", seasonId);
  if (matchErr) throw new Error(matchErr.message);

  const completed = (matches ?? []).filter(
    (m) => m.status && !/^not started$/i.test(String(m.status).trim())
  );
  console.log(
    `Season ${seasonId}: re-mapping team stats for ${completed.length} completed match(es)...`
  );

  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  const total = completed.length;
  const progressEvery = Math.max(1, Math.min(25, Math.ceil(total / 10)));

  for (let i = 0; i < completed.length; i++) {
    const match = completed[i]!;
    const matchSmId = match.sm_id;
    try {
      const { data: payloadRow } = await supabase
        .from("glpm_provider_payloads")
        .select("payload")
        .eq("provider", "sportmonks")
        .eq("entity_type", "match")
        .eq("entity_key", String(matchSmId))
        .maybeSingle();

      const fixture = payloadRow?.payload as SmFixture | undefined;
      if (!fixture?.statistics?.length) {
        skipped += 1;
      } else {
        const { home, away } = resolveParticipants(fixture);
        const stats = mapSportmonksTeamStats({
          fixture,
          homeId: home.id,
          awayId: away.id,
        });

        const { error } = await supabase
          .from("glpm_match_team_stats")
          .upsert(stats, { onConflict: "match_sm_id,team_sm_id" });
        if (error) throw new Error(error.message);
        upserted += stats.length;
      }
    } catch (err) {
      failed += 1;
      console.error(
        `  match ${matchSmId} FAILED:`,
        err instanceof Error ? err.message : err
      );
    }

    const done = i + 1;
    if (done === total || done % progressEvery === 0) {
      console.log(
        `  … ${done}/${total} matches ` +
          `(rows=${upserted}, skipped=${skipped}, failed=${failed})`
      );
    }
  }

  console.log(
    `\nDone: team_stat_rows=${upserted}, skipped_matches=${skipped}, failed=${failed}`
  );
  if (failed > 0) process.exit(1);
  if (upserted === 0) {
    console.error("No team stat rows written — check provider payloads.");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
