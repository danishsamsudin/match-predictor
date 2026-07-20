import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import { runGlpmPredict } from "@/lib/glpm/run-predict";
import type { MatchContext } from "@/lib/glpm/engine";

export const dynamic = "force-dynamic";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      homeTeamSmId?: number;
      awayTeamSmId?: number;
      seasonId?: number | null;
      matchSmId?: number | null;
      context?: MatchContext;
      persist?: boolean;
    };

    const homeTeamSmId = Number(body.homeTeamSmId);
    const awayTeamSmId = Number(body.awayTeamSmId);
    if (!Number.isFinite(homeTeamSmId) || !Number.isFinite(awayTeamSmId)) {
      return NextResponse.json(
        { error: "homeTeamSmId and awayTeamSmId are required" },
        { status: 400 }
      );
    }
    if (homeTeamSmId === awayTeamSmId) {
      return NextResponse.json(
        { error: "Home and away teams must differ" },
        { status: 400 }
      );
    }

    const client = getClient();
    const result = await runGlpmPredict(client, {
      homeTeamSmId,
      awayTeamSmId,
      seasonId: body.seasonId ?? null,
      matchSmId: body.matchSmId ?? null,
      context: body.context,
      persist: body.persist !== false,
    });

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : "GLPM prediction failed";
    const status = message.includes("No GLPM rating vector") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
