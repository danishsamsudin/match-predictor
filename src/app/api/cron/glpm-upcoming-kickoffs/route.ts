import { NextRequest } from "next/server";
import { runGlpmCron } from "@/lib/glpm/sportmonks/cronRoute";
import { refreshUpcomingFixtureTimes } from "@/lib/glpm/sportmonks/refreshUpcomingTimes";

export const runtime = "nodejs";
export const maxDuration = 120;

const HINT =
  "GET|POST /api/cron/glpm-upcoming-kickoffs?run=true — refreshes SportMonks kickoff times for the next week of GLPM fixtures without a full schedule ingest.";

export async function POST(request: NextRequest) {
  return runGlpmCron(request, HINT, () => refreshUpcomingFixtureTimes());
}

export async function GET(request: NextRequest) {
  return runGlpmCron(request, HINT, () => refreshUpcomingFixtureTimes());
}
