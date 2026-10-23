/**
 * Capped recency form factor on λ from last-N team xG for/against (SportMonks).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";

export const FORM_LOOKBACK = 6;
/** Max multiplicative move on each side's λ. */
export const FORM_CAP = 0.07;

export type FormFactorResult = {
  homeMult: number;
  awayMult: number;
  homeRecentXgFor: number | null;
  homeRecentXgAgainst: number | null;
  awayRecentXgFor: number | null;
  awayRecentXgAgainst: number | null;
  nHome: number;
  nAway: number;
};

function clampMult(v: number): number {
  return Math.max(1 - FORM_CAP, Math.min(1 + FORM_CAP, v));
}

async function recentTeamXg(
  client: SupabaseClient<Database>,
  teamSmId: number,
  beforeIso: string | null,
  limit: number
): Promise<{ xgFor: number[]; xgAgainst: number[] }> {
  let q = client
    .from("glpm_matches")
    .select("sm_id, home_team_sm_id, away_team_sm_id, kickoff_at, match_date")
    .or(`home_team_sm_id.eq.${teamSmId},away_team_sm_id.eq.${teamSmId}`)
    .not("home_score", "is", null)
    .order("kickoff_at", { ascending: false })
    .limit(limit * 3);
  if (beforeIso) {
    q = q.lt("kickoff_at", beforeIso);
  }
  const { data: matches } = await q;
  const xgFor: number[] = [];
  const xgAgainst: number[] = [];
  for (const m of matches ?? []) {
    if (xgFor.length >= limit) break;
    const matchId = Number(m.sm_id);
    const { data: stats } = await client
      .from("glpm_match_team_stats")
      .select("team_sm_id, xg")
      .eq("match_sm_id", matchId);
    if (!stats?.length) continue;
    const own = stats.find((s) => Number(s.team_sm_id) === teamSmId);
    const opp = stats.find((s) => Number(s.team_sm_id) !== teamSmId);
    if (own?.xg == null || opp?.xg == null) continue;
    xgFor.push(Number(own.xg));
    xgAgainst.push(Number(opp.xg));
  }
  return { xgFor, xgAgainst };
}

function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/**
 * League-relative form: compare each side's recent xG for/against to the pair mean.
 */
export async function loadFormFactors(input: {
  client: SupabaseClient<Database>;
  homeTeamSmId: number;
  awayTeamSmId: number;
  beforeKickoffIso?: string | null;
}): Promise<FormFactorResult> {
  const [home, away] = await Promise.all([
    recentTeamXg(
      input.client,
      input.homeTeamSmId,
      input.beforeKickoffIso ?? null,
      FORM_LOOKBACK
    ),
    recentTeamXg(
      input.client,
      input.awayTeamSmId,
      input.beforeKickoffIso ?? null,
      FORM_LOOKBACK
    ),
  ]);

  const hFor = mean(home.xgFor);
  const hAgainst = mean(home.xgAgainst);
  const aFor = mean(away.xgFor);
  const aAgainst = mean(away.xgAgainst);

  const attackPool = [hFor, aFor].filter((x): x is number => x != null);
  const defPool = [hAgainst, aAgainst].filter((x): x is number => x != null);
  const attackMean = mean(attackPool) ?? 1.2;
  const defMean = mean(defPool) ?? 1.2;

  // Attack form raises λ; conceding form (higher xGA) raises opponent λ → lower own relative.
  let homeMult = 1;
  let awayMult = 1;
  if (hFor != null) homeMult *= 1 + 0.5 * ((hFor - attackMean) / Math.max(0.4, attackMean));
  if (hAgainst != null)
    homeMult *= 1 - 0.35 * ((hAgainst - defMean) / Math.max(0.4, defMean));
  if (aFor != null) awayMult *= 1 + 0.5 * ((aFor - attackMean) / Math.max(0.4, attackMean));
  if (aAgainst != null)
    awayMult *= 1 - 0.35 * ((aAgainst - defMean) / Math.max(0.4, defMean));

  return {
    homeMult: clampMult(homeMult),
    awayMult: clampMult(awayMult),
    homeRecentXgFor: hFor,
    homeRecentXgAgainst: hAgainst,
    awayRecentXgFor: aFor,
    awayRecentXgAgainst: aAgainst,
    nHome: home.xgFor.length,
    nAway: away.xgFor.length,
  };
}

export function applyFormToXg(
  homeXg: number,
  awayXg: number,
  form: FormFactorResult
): { homeXg: number; awayXg: number } {
  return {
    homeXg: Math.max(0.15, homeXg * form.homeMult),
    awayXg: Math.max(0.15, awayXg * form.awayMult),
  };
}
