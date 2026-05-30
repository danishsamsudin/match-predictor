import { NextRequest, NextResponse } from "next/server";
import { lookupLeagues } from "@/lib/api/football-lookup";

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get("country")?.trim();
  if (!country) {
    return NextResponse.json({ error: "Missing country parameter" }, { status: 400 });
  }

  try {
    const leagues = await lookupLeagues(country);
    return NextResponse.json({ leagues });
  } catch (error) {
    console.error("Failed to load leagues:", error);
    return NextResponse.json({ error: "Failed to load leagues" }, { status: 500 });
  }
}
