import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import {
  persistSeasonSimRun,
  runSeasonMonteCarlo,
  type SeasonSimFixture,
  type SeasonSimStandingRow,
} from "@/lib/glpm-cx/satellites/season-sim";

export const dynamic = "force-dynamic";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as {
      seasonId?: number;
      iterations?: number;
      modelSource?: string;
      fixtures?: SeasonSimFixture[];
      standings?: SeasonSimStandingRow[];
      persist?: boolean;
    };

    const seasonId = Number(body.seasonId);
    if (!Number.isFinite(seasonId)) {
      return NextResponse.json({ error: "seasonId is required" }, { status: 400 });
    }
    if (!body.fixtures?.length || !body.standings?.length) {
      return NextResponse.json(
        { error: "fixtures and standings are required" },
        { status: 400 }
      );
    }

    const result = runSeasonMonteCarlo({
      fixtures: body.fixtures,
      standings: body.standings,
      iterations: body.iterations ?? 2000,
    });

    let runId: string | null = null;
    if (body.persist !== false) {
      const client = getClient();
      runId = await persistSeasonSimRun(client, {
        seasonId,
        modelSource: body.modelSource ?? "glpm_cx",
        iterations: result.iterations,
        summary: result,
      });
    }

    return NextResponse.json({ ...result, runId, seasonId });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Season sim failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
