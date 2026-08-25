import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../supabase";
import { recomputePpdaFromEvents } from "../layer1/extractShots";
import type { WyscoutEventPayload } from "../../wyscout/types";

type Client = SupabaseClient<Database>;
type StatsRow = Database["public"]["Tables"]["glpm_match_team_stats"]["Row"];
type ShotRow = Database["public"]["Tables"]["glpm_match_shots"]["Row"];
type FeaturesInsert = Database["public"]["Tables"]["glpm_match_team_features"]["Insert"];

const WYSCOUT_PENALTY_XG = 0.76;
export const FEATURE_VERSION = "v1";

function ratio(num: number | null, den: number | null): number | null {
  if (num == null || den == null || den === 0) return null;
  return num / den;
}

function sumNullable(values: Array<number | null | undefined>): number | null {
  let sum = 0;
  let any = false;
  for (const v of values) {
    if (v == null || !Number.isFinite(v)) continue;
    sum += v;
    any = true;
  }
  return any ? sum : null;
}

export function buildTeamFeatures(args: {
  stats: StatsRow;
  opponentGoals: number | null;
  shotsFor: ShotRow[];
  shotsAgainst: ShotRow[];
  events?: WyscoutEventPayload[];
  defendingTeamWyId?: number;
}): FeaturesInsert {
  const { stats, shotsFor, shotsAgainst, events } = args;

  const boxShots = shotsFor.filter((s) => s.pos_x != null && s.pos_x >= 84).length;
  const penaltyXg = shotsFor.filter((s) => s.is_penalty).length * WYSCOUT_PENALTY_XG;
  const npxg =
    stats.npxg ??
    (stats.xg != null ? Math.max(0, stats.xg - penaltyXg) : null);

  const psxgFaced = sumNullable(shotsAgainst.map((s) => s.post_shot_xg)) ?? stats.psxg_faced;
  const goalsConceded = args.opponentGoals;
  const goalsFromSot = shotsAgainst.filter((s) => s.is_goal).length;

  const counterShots = shotsFor.filter((s) => s.is_counter_attack);
  const counterXg = sumNullable(counterShots.map((s) => s.pre_shot_xg));
  const counterEfficiency = ratio(counterXg, counterShots.length || null);

  const ppdaEvent =
    events && events.length && args.defendingTeamWyId != null
      ? recomputePpdaFromEvents(events, args.defendingTeamWyId)
      : null;

  return {
    match_sm_id: stats.match_sm_id,
    team_sm_id: stats.team_sm_id,
    xg_per_shot: ratio(stats.xg, stats.shots),
    shot_conversion: ratio(stats.goals, stats.shots),
    big_chance_rate: ratio(stats.big_chances, stats.shots),
    box_shot_pct: ratio(boxShots, shotsFor.length || null),
    progressive_pass_rate: ratio(stats.progressive_passes, stats.passes),
    field_tilt: stats.field_tilt,
    ppda: stats.ppda,
    ppda_allowed: stats.ppda_allowed ?? null,
    ppda_event: ppdaEvent,
    psxg_faced: psxgFaced,
    goals_prevented:
      psxgFaced != null && goalsConceded != null ? psxgFaced - goalsConceded : null,
    psxg_save_pct:
      psxgFaced != null && psxgFaced > 0 ? 1 - goalsFromSot / psxgFaced : null,
    npxg,
    counter_efficiency: counterEfficiency,
    goals_conceded: goalsConceded,
    feature_version: FEATURE_VERSION,
    computed_at: new Date().toISOString(),
  };
}

export async function buildAndUpsertMatchTeamFeatures(
  supabase: Client,
  args: {
    matchSmId: number;
    force?: boolean;
    events?: WyscoutEventPayload[];
    teamSmIdByWyId?: Map<number, number>;
  }
): Promise<FeaturesInsert[]> {
  const { data: statsRows, error: statsErr } = await supabase
    .from("glpm_match_team_stats")
    .select("*")
    .eq("match_sm_id", args.matchSmId);
  if (statsErr) throw new Error(`load match stats failed: ${statsErr.message}`);
  if (!statsRows?.length) throw new Error(`No L1 stats for match ${args.matchSmId}`);

  if (!args.force) {
    const flagged = statsRows.some((r) => r.validation_status === "flagged");
    if (flagged) {
      throw new Error(
        `Match ${args.matchSmId} is flagged; pass force=true to build Layer 2 anyway`
      );
    }
  }

  const { data: shots, error: shotsErr } = await supabase
    .from("glpm_match_shots")
    .select("*")
    .eq("match_sm_id", args.matchSmId);
  if (shotsErr) throw new Error(`load shots failed: ${shotsErr.message}`);

  const home = statsRows.find((r) => r.is_home);
  const away = statsRows.find((r) => !r.is_home);
  if (!home || !away) throw new Error(`Need home and away stats for match ${args.matchSmId}`);

  const shotList = shots ?? [];
  const wyBySm = new Map<number, number>();
  if (args.teamSmIdByWyId) {
    for (const [wy, sm] of args.teamSmIdByWyId) wyBySm.set(sm, wy);
  }

  const features = [
    buildTeamFeatures({
      stats: home,
      opponentGoals: away.goals,
      shotsFor: shotList.filter((s) => s.team_sm_id === home.team_sm_id),
      shotsAgainst: shotList.filter((s) => s.team_sm_id === away.team_sm_id),
      events: args.events,
      defendingTeamWyId: wyBySm.get(home.team_sm_id),
    }),
    buildTeamFeatures({
      stats: away,
      opponentGoals: home.goals,
      shotsFor: shotList.filter((s) => s.team_sm_id === away.team_sm_id),
      shotsAgainst: shotList.filter((s) => s.team_sm_id === home.team_sm_id),
      events: args.events,
      defendingTeamWyId: wyBySm.get(away.team_sm_id),
    }),
  ];

  const { error } = await supabase
    .from("glpm_match_team_features")
    .upsert(features, { onConflict: "match_sm_id,team_sm_id" });
  if (error) throw new Error(`upsert features failed: ${error.message}`);
  return features;
}
