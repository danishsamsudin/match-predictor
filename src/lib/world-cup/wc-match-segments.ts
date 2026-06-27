import type { WcMatchRow } from "@/lib/world-cup/standings";

export type WcMatchSegmentTags = {
  is_knockout: boolean;
  is_group_stage: boolean;
  is_matchday_3: boolean;
  is_low_block: boolean;
  is_high_rotation: boolean;
  is_home_rotated: boolean;
  is_away_rotated: boolean;
  is_host_nation_home: boolean;
  is_favorite_upset_risk: boolean;
  is_high_altitude: boolean;
  fifa_rating_delta: number | null;
  expected_total_xg: number | null;
};

function snapNum(snapshot: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const v = snapshot[key];
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;
}

export function tagWcMatchSegments(input: {
  match: WcMatchRow;
  snapshot: Record<string, unknown>;
  /** Pre-kickoff finished group matches (exclude current fixture). */
  finishedGroupMatchesForHome?: number;
  finishedGroupMatchesForAway?: number;
}): WcMatchSegmentTags {
  const opta = (input.snapshot.opta_features as Record<string, unknown>) ?? {};
  const lowBlockDiff = snapNum(opta, "low_block_index_diff") ?? 0;
  const rotationDiff = snapNum(opta, "rotation_index_diff") ?? 0;
  const rotationHome = snapNum(opta, "rotation_index_home") ?? snapNum(input.snapshot, "rotation_index_home") ?? 0;
  const rotationAway = snapNum(opta, "rotation_index_away") ?? snapNum(input.snapshot, "rotation_index_away") ?? 0;
  const hostMotivation = snapNum(input.snapshot, "host_motivation_home") ?? 1;
  const fifaDelta = snapNum(input.snapshot, "fifa_rating_delta", "delta_fifa");
  const altitude = input.match.venue_altitude_meters ?? snapNum(input.snapshot, "venue_altitude_meters") ?? 0;
  const expectedTotal =
    snapNum(input.snapshot, "expected_total_xg") ??
    (() => {
      const h = snapNum(input.snapshot, "home_xg", "lambda");
      const a = snapNum(input.snapshot, "away_xg", "mu");
      return h != null && a != null ? h + a : null;
    })();

  const isKnockout = !input.match.group_code;
  const homeMd3 = (input.finishedGroupMatchesForHome ?? 0) === 2;
  const awayMd3 = (input.finishedGroupMatchesForAway ?? 0) === 2;

  return {
    is_knockout: isKnockout,
    is_group_stage: Boolean(input.match.group_code),
    is_matchday_3: homeMd3 || awayMd3,
    is_low_block: Math.abs(lowBlockDiff) > 0.35,
    is_high_rotation: rotationHome > 0.25 || rotationAway > 0.25,
    is_home_rotated: rotationHome > 0.25,
    is_away_rotated: rotationAway > 0.25,
    is_host_nation_home: hostMotivation > 1,
    is_high_altitude: altitude > 1500,
    is_favorite_upset_risk:
      fifaDelta != null && Math.abs(fifaDelta) > 80 && expectedTotal != null && expectedTotal < 2.2,
    fifa_rating_delta: fifaDelta,
    expected_total_xg: expectedTotal,
  };
}

/** Count finished group-stage matches for a team before a given fixture date. */
export function countPreKickoffGroupMatches(
  teamId: string,
  matches: WcMatchRow[],
  beforeMatchId: string
): number {
  const target = matches.find((m) => m.id === beforeMatchId);
  const targetDate = target?.date ?? "";
  return matches.filter(
    (m) =>
      m.id !== beforeMatchId &&
      m.status === "finished" &&
      m.group_code &&
      m.date &&
      m.date < targetDate &&
      (m.home_team_id === teamId || m.away_team_id === teamId)
  ).length;
}
