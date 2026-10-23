import { NextResponse } from "next/server";
import { loadGlpmXgHubPayloadCached } from "@/lib/glpm/xg-hub-load-cached";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seasonId = url.searchParams.get("seasonId");
    const competitionId = url.searchParams.get("competitionId");
    const payload = await loadGlpmXgHubPayloadCached({
      seasonId: seasonId ? Number(seasonId) : null,
      competitionId: competitionId ? Number(competitionId) : null,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load GLPM xG hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
