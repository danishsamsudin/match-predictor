import { NextResponse } from "next/server";
import { loadNationsLeagueHubPayload } from "@/lib/nations-league/hub-load";

export async function GET() {
  try {
    const payload = await loadNationsLeagueHubPayload();
    if (!payload) {
      return NextResponse.json({ error: "Hub unavailable" }, { status: 503 });
    }
    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to load NL hub";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
