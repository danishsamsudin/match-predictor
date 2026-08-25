import { NextResponse } from "next/server";
import { loadGlpmHubPayloadCached } from "@/lib/glpm/hub-load-cached";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seasonId = url.searchParams.get("seasonId");
    const competitionId = url.searchParams.get("competitionId");
    const includeWeather = url.searchParams.get("weather") === "1";
    const payload = await loadGlpmHubPayloadCached({
      seasonId: seasonId ? Number(seasonId) : null,
      competitionId: competitionId ? Number(competitionId) : null,
      includeWeather,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load GLPM hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
