import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { refreshSportmonksSchedulesWithDefaults } from "@/lib/glpm/sportmonks/refreshSchedules";

export const runtime = "nodejs";
export const maxDuration = 240;

function resolveCronSecret(): string | undefined {
  return getSyncCronSecret() ?? process.env.CRON_SECRET?.trim() ?? undefined;
}

function isAuthorized(request: NextRequest): boolean {
  const secret = resolveCronSecret();
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const provided = authHeader?.replace(/^Bearer\s+/i, "") ?? querySecret;
  return provided === secret;
}

function parseBoolParam(request: NextRequest, name: string): boolean | undefined {
  const raw = request.nextUrl.searchParams.get(name);
  if (!raw) return undefined;
  return raw === "true";
}

async function run(request: NextRequest) {
  const windowAll = request.nextUrl.searchParams.get("window") === "all";
  const buildFeatures = parseBoolParam(request, "buildFeatures") ?? false;
  const forceFeatures = parseBoolParam(request, "forceFeatures") ?? false;
  const dryRun = parseBoolParam(request, "dryRun") ?? false;

  const seasonIdsRaw = request.nextUrl.searchParams.get("seasonIds");
  const seasonIds = seasonIdsRaw
    ? seasonIdsRaw
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n))
    : undefined;

  const pastDaysRaw = request.nextUrl.searchParams.get("pastDays");
  const futureDaysRaw = request.nextUrl.searchParams.get("futureDays");
  const pastDaysEnv = process.env.SPORTMONKS_REFRESH_PAST_DAYS;
  const futureDaysEnv = process.env.SPORTMONKS_REFRESH_FUTURE_DAYS;

  const pastDays = pastDaysRaw ? Number(pastDaysRaw) : pastDaysEnv ? Number(pastDaysEnv) : undefined;
  const futureDays = futureDaysRaw ? Number(futureDaysRaw) : futureDaysEnv ? Number(futureDaysEnv) : undefined;

  const maxFixturesRaw = request.nextUrl.searchParams.get("maxFixtures");
  const maxFixtures = maxFixturesRaw ? Number(maxFixturesRaw) : undefined;

  return refreshSportmonksSchedulesWithDefaults({
    seasonIds,
    windowAll,
    pastDays: pastDays && Number.isFinite(pastDays) ? pastDays : undefined,
    futureDays: futureDays && Number.isFinite(futureDays) ? futureDays : undefined,
    buildFeatures,
    forceFeatures,
    maxFixtures: maxFixtures && Number.isFinite(maxFixtures) ? maxFixtures : undefined,
    dryRun,
  });
}

export async function POST(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await run(request);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({
      hint: "GET /api/cron/glpm-sportmonks-refresh-schedules?run=true&seasonIds=28083,27958,...&window=relative",
      defaults: {
        window: "relative (past 7d / future 14d)",
        buildFeatures: false,
      },
    });
  }

  try {
    const result = await run(request);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

