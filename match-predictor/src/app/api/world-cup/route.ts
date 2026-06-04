import { NextResponse } from "next/server";
import { loadWorldCupHubPayload } from "@/lib/world-cup/hub-load";

export const dynamic = "force-dynamic";

export async function GET() {
  const payload = await loadWorldCupHubPayload();
  if (!payload) {
    return NextResponse.json(
      { error: "World Cup hub data unavailable. Configure Supabase service role." },
      { status: 503 }
    );
  }
  return NextResponse.json(payload);
}
