import { NextResponse } from "next/server";
import { fbrefStoreAvailable, listFbrefTeams } from "@/lib/fbref/supabase-store";

export async function GET() {
  if (!fbrefStoreAvailable()) {
    return NextResponse.json(
      {
        error:
          "Supabase service role not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.",
      },
      { status: 503 }
    );
  }
  try {
    const teams = await listFbrefTeams();
    return NextResponse.json({ teams, count: teams.length });
  } catch (error) {
    console.error("fbref teams:", error);
    return NextResponse.json({ error: "Failed to load FBref teams" }, { status: 500 });
  }
}
