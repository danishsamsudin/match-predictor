import { NextRequest, NextResponse } from "next/server";
import { runPrediction } from "@/lib/prediction/engine";
import { tryCreateServiceClient, type Database } from "@/lib/supabase";
import type { FixtureLineup } from "@/lib/types/football";
import type { PredictRequest } from "@/lib/types/prediction";
import { sanitizeUserFacingMessage } from "@/lib/api/user-facing-messages";
import { RateLimitError, UpstreamApiError } from "@/lib/types/prediction";

type PredictionInsert = Database["public"]["Tables"]["predictions"]["Insert"];

function parseCustomLineups(raw: unknown): FixtureLineup[] | undefined {
  if (!Array.isArray(raw) || raw.length === 0) return undefined;
  const lineups: FixtureLineup[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") return undefined;
    const row = item as Record<string, unknown>;
    const team = row.team as { id?: number; name?: string } | undefined;
    if (!team || !Number.isFinite(Number(team.id))) return undefined;
    const startXI = row.startXI;
    if (!Array.isArray(startXI)) return undefined;
    lineups.push({
      team: { id: Number(team.id), name: String(team.name ?? "Team") },
      formation: String(row.formation ?? "4-3-3"),
      startXI: startXI as FixtureLineup["startXI"],
      substitutes: Array.isArray(row.substitutes)
        ? (row.substitutes as FixtureLineup["substitutes"])
        : [],
    });
  }
  return lineups.length ? lineups : undefined;
}

function validateBody(body: unknown): PredictRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;

  const mode = b.mode === "compare" ? "compare" : "fixture";
  const matchId = b.matchId !== undefined && b.matchId !== "" ? Number(b.matchId) : undefined;
  const homeTeamId = Number(b.homeTeamId);
  const awayTeamId = Number(b.awayTeamId);
  const homeLeagueId =
    b.homeLeagueId !== undefined && b.homeLeagueId !== ""
      ? Number(b.homeLeagueId)
      : undefined;
  const awayLeagueId =
    b.awayLeagueId !== undefined && b.awayLeagueId !== ""
      ? Number(b.awayLeagueId)
      : undefined;
  const entityType = b.entityType === "national" ? "national" : "club";
  const homeTeamName =
    typeof b.homeTeamName === "string" && b.homeTeamName.trim()
      ? b.homeTeamName.trim()
      : undefined;
  const awayTeamName =
    typeof b.awayTeamName === "string" && b.awayTeamName.trim()
      ? b.awayTeamName.trim()
      : undefined;
  const homeTeamShortName =
    typeof b.homeTeamShortName === "string" && b.homeTeamShortName.trim()
      ? b.homeTeamShortName.trim()
      : undefined;
  const awayTeamShortName =
    typeof b.awayTeamShortName === "string" && b.awayTeamShortName.trim()
      ? b.awayTeamShortName.trim()
      : undefined;
  const city = typeof b.city === "string" ? b.city.trim() : "";
  const matchDate = typeof b.matchDate === "string" ? b.matchDate.trim() : "";
  const customLineups = parseCustomLineups(b.customLineups);

  if (
    !Number.isFinite(homeTeamId) ||
    !Number.isFinite(awayTeamId) ||
    !city ||
    !matchDate
  ) {
    return null;
  }

  if (mode === "compare") {
    if (
      !Number.isFinite(homeLeagueId) ||
      !Number.isFinite(awayLeagueId)
    ) {
      return null;
    }
    return {
      mode,
      homeTeamId,
      awayTeamId,
      homeLeagueId,
      awayLeagueId,
      entityType,
      homeTeamName,
      awayTeamName,
      homeTeamShortName,
      awayTeamShortName,
      city,
      matchDate,
      customLineups,
    };
  }

  if (!Number.isFinite(matchId)) {
    return null;
  }

  return {
    mode: "fixture",
    matchId,
    homeTeamId,
    awayTeamId,
    homeLeagueId: Number.isFinite(homeLeagueId) ? homeLeagueId : undefined,
    awayLeagueId: Number.isFinite(awayLeagueId) ? awayLeagueId : undefined,
    entityType,
    homeTeamName,
    awayTeamName,
    homeTeamShortName,
    awayTeamShortName,
    city,
    matchDate,
    customLineups,
  };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = validateBody(body);

    if (!input) {
      return NextResponse.json(
        {
          error:
            "Invalid request body. Fixture mode: matchId, homeTeamId, awayTeamId, city, matchDate. Compare mode: homeTeamId, awayTeamId, homeLeagueId, awayLeagueId, city, matchDate.",
        },
        { status: 400 }
      );
    }

    const result = await runPrediction(input);

    const supabase = tryCreateServiceClient();
    if (supabase) {
      try {
        const row: PredictionInsert = {
          match_id: input.matchId ?? 0,
          home_team_id: input.homeTeamId,
          away_team_id: input.awayTeamId,
          city: input.city,
          match_date: input.matchDate,
          home_win_pct: result.homeWinPct,
          away_win_pct: result.awayWinPct,
          draw_pct: result.drawPct,
          home_xg: result.expectedGoals.home,
          away_xg: result.expectedGoals.away,
          estimated_corners: result.estimated.corners,
          estimated_fouls: result.estimated.fouls,
          estimated_yellow_cards: result.estimated.yellowCards,
          estimated_red_cards: result.estimated.redCards,
          explanation: result.explanation,
          inputs_snapshot: input,
          entity_type: input.entityType ?? "club",
          home_league_id: input.homeLeagueId ?? null,
          away_league_id: input.awayLeagueId ?? null,
          comparison_mode: input.mode ?? "fixture",
        };

        const { data: saved, error } = await supabase
          .from("predictions")
          .insert(row)
          .select("id")
          .single();

        if (error) {
          console.error("Failed to persist prediction:", error.message);
        } else if (saved) {
          result.id = saved.id;
        }
      } catch (dbError) {
        console.error("Supabase unavailable, returning prediction without persist:", dbError);
      }
    }

    const { debug, ...publicResult } = result;
    void debug;
    return NextResponse.json({
      ...publicResult,
      mode: input.mode ?? "fixture",
      entityType: input.entityType ?? "club",
    });
  } catch (error) {
    if (error instanceof RateLimitError || error instanceof UpstreamApiError) {
      const status = error instanceof RateLimitError ? 503 : 502;
      return NextResponse.json(
        {
          error:
            sanitizeUserFacingMessage(error.message) ??
            "Unable to complete prediction. Please try again.",
        },
        { status }
      );
    }
    console.error("Prediction error:", error);
    return NextResponse.json(
      { error: "Internal server error during prediction" },
      { status: 500 }
    );
  }
}
