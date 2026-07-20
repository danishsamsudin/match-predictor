import { NextResponse } from "next/server";
import { tryCreateServiceClient, createServerClient } from "@/lib/supabase";
import { loadGlpmHubPayload } from "@/lib/glpm/hub-load";

export const dynamic = "force-dynamic";

function getClient() {
  return tryCreateServiceClient() ?? createServerClient();
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const seasonId = url.searchParams.get("seasonId");
    const competitionId = url.searchParams.get("competitionId");
    const client = getClient();
    const payload = await loadGlpmHubPayload(client, {
      seasonId: seasonId ? Number(seasonId) : null,
      competitionId: competitionId ? Number(competitionId) : null,
    });
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load GLPM hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
