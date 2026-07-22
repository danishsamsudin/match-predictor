/**
 * Backfill glpm_match_vs_style for a season from finished matches + style snapshots.
 *
 *   npx tsx scripts/glpm-backfill-vs-style.ts --season-id 25583
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import { loadStyleSnapshot } from "@/lib/glpm/load-vectors";
import {
  buildMatchVsStyleRows,
  upsertMatchVsStyle,
} from "@/lib/glpm-cx/vs-style";

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i < 0) return null;
  return process.argv[i + 1] ?? null;
}

async function main() {
  const seasonRaw = argValue("--season-id");
  const seasonId = seasonRaw ? Number(seasonRaw) : NaN;
  if (!Number.isFinite(seasonId)) {
    console.error("Usage: npx tsx scripts/glpm-backfill-vs-style.ts --season-id <id>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.error("Missing Supabase env");
    process.exit(1);
  }

  const client = createClient<Database>(url, key);
  const { data: matches, error } = await client
    .from("glpm_matches")
    .select("sm_id,home_team_sm_id,away_team_sm_id")
    .eq("season_id", seasonId)
    .not("home_score", "is", null)
    .not("away_score", "is", null);

  if (error) throw error;
  let upserted = 0;
  for (const match of matches ?? []) {
    const [homeStyle, awayStyle, { data: stats }] = await Promise.all([
      loadStyleSnapshot(client, {
        teamSmId: match.home_team_sm_id,
        seasonId,
      }),
      loadStyleSnapshot(client, {
        teamSmId: match.away_team_sm_id,
        seasonId,
      }),
      client
        .from("glpm_match_team_stats")
        .select("team_sm_id,xg,xg_conceded,shots,ppda,field_tilt")
        .eq("match_sm_id", match.sm_id),
    ]);

    const homeStats = (stats ?? []).find((s) => s.team_sm_id === match.home_team_sm_id);
    const awayStats = (stats ?? []).find((s) => s.team_sm_id === match.away_team_sm_id);
    const homeLabels = Array.isArray(homeStyle?.style_labels)
      ? (homeStyle!.style_labels as string[])
      : [];
    const awayLabels = Array.isArray(awayStyle?.style_labels)
      ? (awayStyle!.style_labels as string[])
      : [];

    const rows = buildMatchVsStyleRows(
      match.sm_id,
      match.home_team_sm_id,
      match.away_team_sm_id,
      {
        xg: homeStats?.xg,
        xg_conceded: homeStats?.xg_conceded,
        shots: homeStats?.shots,
        ppda: homeStats?.ppda,
        field_tilt: homeStats?.field_tilt,
      },
      {
        xg: awayStats?.xg,
        xg_conceded: awayStats?.xg_conceded,
        shots: awayStats?.shots,
        ppda: awayStats?.ppda,
        field_tilt: awayStats?.field_tilt,
      },
      awayLabels,
      homeLabels
    );
    const res = await upsertMatchVsStyle(client, rows);
    if (res.error) {
      console.warn(`match ${match.sm_id}: ${res.error}`);
    } else {
      upserted += res.upserted;
    }
  }

  console.log(`vs-style backfill season ${seasonId}: upserted ${upserted} rows`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
