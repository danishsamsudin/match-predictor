/**
 * Live SportMonks probe: xG Basic via include=xGFixture vs /expected/fixtures.
 *
 * Usage: npx tsx scripts/glpm-probe-sm-xg.ts
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";
import {
  attachExpectedXgToFixtures,
  createSportmonksClient,
} from "../src/lib/sportmonks";
import type { SmApiResponse, SmFixture } from "../src/lib/sportmonks/types";
import { SM_STAT_TYPE } from "../src/lib/sportmonks/statTypes";

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

function unwrapFixture(res: SmApiResponse<SmFixture> | SmFixture, id: number): SmFixture {
  if (res && typeof res === "object" && "data" in res && (res as SmApiResponse<SmFixture>).data) {
    return (res as SmApiResponse<SmFixture>).data;
  }
  const fx = res as SmFixture;
  if (!fx.id) fx.id = id;
  return fx;
}

async function probe(leagueSmId: number, label: string) {
  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const sm = createSportmonksClient();
  const { data: matches } = await sb
    .from("glpm_matches")
    .select("sm_id, match_date")
    .eq("league_sm_id", leagueSmId)
    .not("home_score", "is", null)
    .order("match_date", { ascending: false })
    .limit(3);

  console.log(`\n== ${label} (league ${leagueSmId}) ==`);
  for (const m of matches ?? []) {
    const id = Number(m.sm_id);
    const raw = unwrapFixture(
      (await sm.getFixture(id, "statistics;xGFixture;participants;scores")) as
        | SmApiResponse<SmFixture>
        | SmFixture,
      id
    );
    const includeCount = (raw.xGFixture ?? []).filter(
      (r) => Number(r.type_id) === SM_STAT_TYPE.EXPECTED_GOALS
    ).length;
    const [enriched] = await attachExpectedXgToFixtures(sm, [raw], { maxScanPages: 40 });
    const expectedXg = (enriched?.xGFixture ?? []).filter(
      (r) => Number(r.type_id) === SM_STAT_TYPE.EXPECTED_GOALS
    );
    console.log(
      JSON.stringify(
        {
          match: id,
          date: m.match_date,
          includeXgFixture5304: includeCount,
          expectedEndpoint5304: expectedXg.length,
          xgSample: expectedXg.map((r) => ({
            participant: r.participant_id,
            location: r.location,
            value: r.data?.value ?? r.value,
          })),
        },
        null,
        2
      )
    );
  }
}

async function main() {
  loadEnvLocal();
  await probe(9, "Championship");
  await probe(72, "Eredivisie");
  await probe(8, "Premier League (control)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
