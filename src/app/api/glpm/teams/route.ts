import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import { loadPromotedTeamIds } from "@/lib/glpm/promotion";
import {
  shouldWarnPromotedTeam,
  TRAIN_FALLBACK_BY_LEAGUE,
} from "@/lib/glpm/resolve-train-season";

export const dynamic = "force-dynamic";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

/**
 * List GLPM teams, optionally filtered to teams that have a rating vector
 * for the given season (preferred for Clubs compare).
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seasonIdParam = url.searchParams.get("seasonId");
    const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
    const client = getClient();

    let teamIds: number[] | null = null;
    let promotedWarningIds = new Set<number>();

    if (seasonIdParam) {
      const seasonId = Number(seasonIdParam);
      const { data: vectors, error } = await client
        .from("glpm_team_rating_vectors")
        .select("team_sm_id")
        .eq("season_id", seasonId);
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      teamIds = [...new Set((vectors ?? []).map((v) => v.team_sm_id))];
      if (teamIds.length === 0) {
        // Fall back to teams that appear in season matches
        const { data: matches } = await client
          .from("glpm_matches")
          .select("home_team_sm_id,away_team_sm_id")
          .eq("season_id", seasonId)
          .limit(500);
        const ids = new Set<number>();
        for (const m of matches ?? []) {
          ids.add(m.home_team_sm_id);
          ids.add(m.away_team_sm_id);
        }
        teamIds = [...ids];
      }

      const { data: seasonMeta } = await client
        .from("glpm_seasons")
        .select("sm_id,competition_id")
        .eq("sm_id", seasonId)
        .maybeSingle();
      const competitionId = seasonMeta?.competition_id ?? null;

      if (competitionId != null && teamIds.length > 0) {
        const priorSeasonIdRaw = TRAIN_FALLBACK_BY_LEAGUE[competitionId] ?? null;
        const priorSeasonId =
          priorSeasonIdRaw != null && priorSeasonIdRaw !== seasonId
            ? priorSeasonIdRaw
            : null;

        if (priorSeasonId != null) {
          const [{ data: seasonRows }, { data: priorVectorRows }] =
            await Promise.all([
              client
                .from("glpm_seasons")
                .select("sm_id,competition_id,start_date")
                .eq("competition_id", competitionId)
                .order("start_date", { ascending: false }),
              client
                .from("glpm_team_rating_vectors")
                .select("team_sm_id")
                .eq("season_id", priorSeasonId),
            ]);

          const seasons = (seasonRows ?? []).map((s) => ({
            smId: s.sm_id,
            competitionId: s.competition_id,
            startDate: s.start_date,
          }));
          const priorVectorIds = new Set(
            (priorVectorRows ?? []).map((r) => r.team_sm_id)
          );
          const promoted = await loadPromotedTeamIds(client, {
            seasonId,
            competitionId,
            currentTeamIds: teamIds,
            seasons,
          });

          for (const id of promoted) {
            if (
              shouldWarnPromotedTeam({
                isPromoted: true,
                priorSeasonId,
                seasonId,
                hasPriorSeasonVector: priorVectorIds.has(id),
              })
            ) {
              promotedWarningIds.add(id);
            }
          }
        }
      }
    }

    let query = client.from("glpm_teams").select("sm_id,name,official_name").order("name");
    if (teamIds != null) {
      if (teamIds.length === 0) {
        return NextResponse.json({ teams: [] });
      }
      query = query.in("sm_id", teamIds);
    }
    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    let teams = (data ?? []).map((t) => ({
      id: t.sm_id,
      name: t.name,
      shortName: t.official_name,
      promotedWarning: promotedWarningIds.has(t.sm_id),
    }));
    if (q) {
      teams = teams.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          (t.shortName ?? "").toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ teams });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load teams";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
