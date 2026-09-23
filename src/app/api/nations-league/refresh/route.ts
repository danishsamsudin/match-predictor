import { NextResponse } from "next/server";
import { refreshNationsLeagueHubSnapshot } from "@/lib/nations-league/hub-load";

export async function POST() {
  try {
    const payload = await refreshNationsLeagueHubSnapshot();
    return NextResponse.json({ ok: true, updatedAt: payload?.updatedAt ?? null });
  } catch (err) {
    const message = err instanceof Error ? err.message : "NL hub refresh failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
