/**
 * Backfill SportMonks field_tilt / set_piece_xg / open_play_xg proxies on existing
 * glpm_match_team_stats rows (without re-fetching fixtures).
 *
 *   npx tsx scripts/glpm-backfill-sm-proxies.ts
 *   npx tsx scripts/glpm-backfill-sm-proxies.ts --season-ids 25583,28083 --dry-run
 */
import { loadEnvLocal } from "./glpm-sportmonks-cli-utils";
import { tryCreateServiceClient, createServerClient } from "../src/lib/supabase";
import {
  computeFieldTiltProxy,
  SET_PIECE_XG_PER_CORNER,
} from "../src/lib/glpm/layer1/sportmonks/proxies";
import { DEFAULT_GLPM_SEASON_IDS_2026_27, SM_SEASON_2025_26 } from "../src/lib/sportmonks/constants";

loadEnvLocal();

function parseSeasonIds(): number[] {
  const idx = process.argv.indexOf("--season-ids");
  if (idx >= 0 && process.argv[idx + 1]) {
    return process.argv[idx + 1]!
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n));
  }
  return [...Object.values(SM_SEASON_2025_26), ...DEFAULT_GLPM_SEASON_IDS_2026_27];
}

const dryRun = process.argv.includes("--dry-run");

type StatsRow = {
  match_sm_id: number;
  team_sm_id: number;
  final_third_entries: number | null;
  box_entries: number | null;
  possession_pct: number | null;
  corners: number | null;
  xg: number | null;
  field_tilt: number | null;
  set_piece_xg: number | null;
  open_play_xg: number | null;
  payload: Record<string, unknown> | null;
};

function isProtectedOverlay(
  payload: Record<string, unknown> | null,
  key: "field_tilt" | "set_piece_xg" | "open_play_xg"
): boolean {
  if (!payload) return false;
  const source = payload[`${key}_source`];
  return typeof source === "string" && source !== "sportmonks_proxy";
}

async function main() {
  const client = tryCreateServiceClient() ?? createServerClient();
  const seasonIds = parseSeasonIds();
  console.log("GLPM SportMonks proxy backfill");
  console.log(`  seasons: ${seasonIds.join(", ")}`);
  console.log(`  dry-run: ${dryRun}`);

  let updated = 0;
  let skippedProtected = 0;
  let scanned = 0;

  for (const seasonId of seasonIds) {
    const { data: matches, error: matchErr } = await client
      .from("glpm_matches")
      .select("sm_id")
      .eq("season_id", seasonId);
    if (matchErr) throw new Error(matchErr.message);
    const matchIds = (matches ?? []).map((m) => m.sm_id);
    console.log(`season ${seasonId}: ${matchIds.length} matches`);

    for (let i = 0; i < matchIds.length; i += 80) {
      const chunk = matchIds.slice(i, i + 80);
      const { data: rows, error } = await client
        .from("glpm_match_team_stats")
        .select(
          "match_sm_id,team_sm_id,final_third_entries,box_entries,possession_pct,corners,xg,field_tilt,set_piece_xg,open_play_xg,payload"
        )
        .in("match_sm_id", chunk);
      if (error) throw new Error(error.message);

      const byMatch = new Map<number, StatsRow[]>();
      for (const row of (rows ?? []) as StatsRow[]) {
        scanned += 1;
        const list = byMatch.get(row.match_sm_id) ?? [];
        list.push(row);
        byMatch.set(row.match_sm_id, list);
      }

      for (const [, sides] of byMatch) {
        if (sides.length !== 2) continue;
        const [a, b] = sides;
        for (const [own, opp] of [
          [a, b],
          [b, a],
        ] as const) {
          const payload =
            own.payload && typeof own.payload === "object"
              ? { ...own.payload }
              : ({} as Record<string, unknown>);

          const patch: Record<string, unknown> = {};
          const nextPayload = { ...payload };

          if (!isProtectedOverlay(payload, "field_tilt")) {
            const tilt = computeFieldTiltProxy({
              ownDangerousAttacks: own.final_third_entries,
              oppDangerousAttacks: opp.final_third_entries,
              ownShotsInsideBox: own.box_entries,
              oppShotsInsideBox: opp.box_entries,
              possessionPct: own.possession_pct,
            });
            if (tilt != null && tilt !== own.field_tilt) {
              patch.field_tilt = tilt;
              nextPayload.field_tilt_source = "sportmonks_proxy";
              nextPayload.field_tilt_proxy = true;
            }
            if (
              own.final_third_entries != null &&
              opp.final_third_entries != null &&
              own.final_third_entries + opp.final_third_entries > 0
            ) {
              patch.territory_pct =
                Math.round(
                  (100 * own.final_third_entries) /
                    (own.final_third_entries + opp.final_third_entries) *
                    100
                ) / 100;
            }
          } else {
            skippedProtected += 1;
          }

          if (
            !isProtectedOverlay(payload, "set_piece_xg") &&
            !isProtectedOverlay(payload, "open_play_xg")
          ) {
            if (own.corners != null && Number.isFinite(own.corners)) {
              const setPiece =
                Math.round(Math.max(0, own.corners) * SET_PIECE_XG_PER_CORNER * 1000) /
                1000;
              const openPlay =
                own.xg != null
                  ? Math.round(Math.max(0, own.xg - setPiece) * 1000) / 1000
                  : null;
              if (setPiece !== own.set_piece_xg || openPlay !== own.open_play_xg) {
                patch.set_piece_xg = setPiece;
                patch.open_play_xg = openPlay;
                nextPayload.set_piece_xg_source = "sportmonks_proxy";
                nextPayload.open_play_xg_source = "sportmonks_proxy";
                nextPayload.set_piece_xg_proxy = true;
              }
            }
          } else {
            skippedProtected += 1;
          }

          if (!Object.keys(patch).length) continue;
          patch.payload = nextPayload;
          patch.synced_at = new Date().toISOString();
          updated += 1;
          if (dryRun) continue;
          const { error: upErr } = await client
            .from("glpm_match_team_stats")
            .update(patch)
            .eq("match_sm_id", own.match_sm_id)
            .eq("team_sm_id", own.team_sm_id);
          if (upErr) throw new Error(upErr.message);
        }
      }
    }
  }

  console.log(
    JSON.stringify(
      { scanned, updated, skippedProtected, dryRun },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
