/**
 * Backfill GK player stats for a season from stored SportMonks payloads + team stats.
 * Use when matches were ingested before lineup/team GK mapping, or with --skip-backfill.
 *
 * Usage:
 *   npx tsx scripts/glpm-sportmonks-backfill-gk-stats.ts <seasonId>
 */
import fs from "node:fs";
import path from "node:path";
import { mapSportmonksGkStatsFromFixture } from "../src/lib/glpm/layer1/sportmonks/mapLineupPlayerStats";
import { ensureFixturePlayersReferenced } from "../src/lib/glpm/layer1/sportmonks/mapEntities";
import { resolveParticipants } from "../src/lib/glpm/layer1/sportmonks/upsertFixture";
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
    console.error("Usage: npx tsx scripts/glpm-sportmonks-backfill-gk-stats.ts <seasonId>");
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
  console.log(`Season ${seasonId}: backfilling GK stats for ${completed.length} completed match(es)...`);

  let upserted = 0;
  let skipped = 0;
  let failed = 0;
  const total = completed.length;
  const progressEvery = Math.max(1, Math.min(25, Math.ceil(total / 10)));

  for (let i = 0; i < completed.length; i++) {
    const match = completed[i]!;
    const matchSmId = match.sm_id;
    try {
      const [{ data: payloadRow }, { data: teamStats }] = await Promise.all([
        supabase
          .from("glpm_provider_payloads")
          .select("payload")
          .eq("provider", "sportmonks")
          .eq("entity_type", "match")
          .eq("entity_key", String(matchSmId))
          .maybeSingle(),
        supabase
          .from("glpm_match_team_stats")
          .select("*")
          .eq("match_sm_id", matchSmId),
      ]);

      const fixture = payloadRow?.payload as SmFixture | undefined;
      if (!fixture?.lineups?.length || !teamStats?.length) {
        skipped += 1;
      } else {
        const { home, away } = resolveParticipants(fixture);
        await ensureFixturePlayersReferenced(supabase, fixture);
        const rows = mapSportmonksGkStatsFromFixture({
          fixture,
          teamStats,
          homeId: home.id,
          awayId: away.id,
        });
        if (!rows.length) {
          skipped += 1;
        } else {
          const { error } = await supabase
            .from("glpm_match_player_stats")
            .upsert(rows, { onConflict: "match_sm_id,player_sm_id" });
          if (error) throw new Error(error.message);
          upserted += rows.length;
        }
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
          `(gk_rows=${upserted}, skipped=${skipped}, failed=${failed})`
      );
    }
  }

  console.log(`\nDone: gk_player_rows=${upserted}, skipped_matches=${skipped}, failed=${failed}`);
  if (failed > 0) process.exit(1);
  if (upserted === 0) {
    console.error("No GK player rows written — check lineups in provider payloads and team stats.");
    process.exit(1);
  }

  // FK: glpm_player_primary_ratings requires glpm_players rows
  const { data: gkStats } = await supabase
    .from("glpm_match_player_stats")
    .select("player_sm_id, team_sm_id")
    .eq("is_goalkeeper", true)
    .in("match_sm_id", completed.map((m) => m.sm_id));
  const unique = new Map<number, number>();
  for (const row of gkStats ?? []) {
    unique.set(row.player_sm_id, row.team_sm_id);
  }
  if (unique.size) {
    const players = [...unique.entries()].map(([player_sm_id, team_sm_id]) => ({
      sm_id: player_sm_id,
      current_team_sm_id: team_sm_id,
      short_name: `Player ${player_sm_id}`,
      role_name: "Goalkeeper",
      synced_at: new Date().toISOString(),
    }));
    const { error: playerErr } = await supabase
      .from("glpm_players")
      .upsert(players, { onConflict: "sm_id" });
    if (playerErr) throw new Error(`ensure glpm_players failed: ${playerErr.message}`);
    console.log(`Ensured ${players.length} goalkeeper player(s) in glpm_players.`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
