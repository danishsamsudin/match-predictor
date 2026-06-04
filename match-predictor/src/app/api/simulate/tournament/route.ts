import { NextRequest, NextResponse } from "next/server";
import { runTournamentMatchSim } from "@/lib/prediction/tournament-sim";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const matches = body?.matches;
    if (!Array.isArray(matches) || !matches.length) {
      return NextResponse.json(
        { error: "matches array required with homeXg and awayXg" },
        { status: 400 }
      );
    }

    const parsed = matches.map((m: Record<string, unknown>) => ({
      homeTeamId: Number(m.homeTeamId) || 0,
      awayTeamId: Number(m.awayTeamId) || 0,
      homeXg: Number(m.homeXg),
      awayXg: Number(m.awayXg),
      neutral: Boolean(m.neutral),
    }));

    if (parsed.some((m) => !Number.isFinite(m.homeXg) || !Number.isFinite(m.awayXg))) {
      return NextResponse.json({ error: "Invalid homeXg or awayXg" }, { status: 400 });
    }

    const iterations = Math.min(
      10_000,
      Math.max(1, Number(body.iterations) || 1000)
    );

    const result = runTournamentMatchSim({
      matches: parsed,
      iterations,
      correlation: Number(body.correlation) || 0,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Tournament sim error:", err);
    return NextResponse.json({ error: "Simulation failed" }, { status: 500 });
  }
}
