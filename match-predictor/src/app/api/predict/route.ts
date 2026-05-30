import { NextRequest, NextResponse } from "next/server";
import { runPrediction } from "@/lib/prediction/engine";
import { tryCreateServiceClient, type Database } from "@/lib/supabase";
import type { PredictRequest } from "@/lib/types/prediction";
import { RateLimitError, UpstreamApiError } from "@/lib/types/prediction";

type PredictionInsert = Database["public"]["Tables"]["predictions"]["Insert"];

function validateBody(body: unknown): PredictRequest | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const matchId = Number(b.matchId);
  const homeTeamId = Number(b.homeTeamId);
  const awayTeamId = Number(b.awayTeamId);
  const city = typeof b.city === "string" ? b.city.trim() : "";
  const matchDate = typeof b.matchDate === "string" ? b.matchDate.trim() : "";

  if (
    !Number.isFinite(matchId) ||
    !Number.isFinite(homeTeamId) ||
    !Number.isFinite(awayTeamId) ||
    !city ||
    !matchDate
  ) {
    return null;
  }

  return { matchId, homeTeamId, awayTeamId, city, matchDate };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = validateBody(body);

    if (!input) {
      return NextResponse.json(
        {
          error: "Invalid request body. Required: matchId, homeTeamId, awayTeamId, city, matchDate",
        },
        { status: 400 }
      );
    }

    const result = await runPrediction(input);

    const supabase = tryCreateServiceClient();
    if (supabase) {
      try {
        const row: PredictionInsert = {
          match_id: input.matchId,
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
    return NextResponse.json(publicResult);
  } catch (error) {
    if (error instanceof RateLimitError) {
      return NextResponse.json({ error: error.message }, { status: 429 });
    }
    if (error instanceof UpstreamApiError) {
      return NextResponse.json({ error: error.message }, { status: 502 });
    }
    console.error("Prediction error:", error);
    return NextResponse.json(
      { error: "Internal server error during prediction" },
      { status: 500 }
    );
  }
}
