import { NextRequest, NextResponse } from "next/server";
import { getSyncCronSecret } from "@/lib/config/data-source";
import { parseIdList, DEFAULT_GLPM_SEASON_IDS_2026_27 } from "@/lib/sportmonks/constants";

export function isGlpmCronAuthorized(request: NextRequest): boolean {
  const secret = getSyncCronSecret() ?? process.env.CRON_SECRET?.trim();
  if (!secret) return true;
  const authHeader = request.headers.get("authorization");
  const querySecret = request.nextUrl.searchParams.get("secret");
  const provided = authHeader?.replace(/^Bearer\s+/i, "") ?? querySecret;
  return provided === secret;
}

export function parseSeasonIdsParam(request: NextRequest): number[] | undefined {
  const raw = request.nextUrl.searchParams.get("seasonIds");
  if (!raw) return undefined;
  return parseIdList(raw, DEFAULT_GLPM_SEASON_IDS_2026_27);
}

export function parseBoolQuery(request: NextRequest, name: string): boolean {
  return request.nextUrl.searchParams.get(name) === "true";
}

export function parseNumberQuery(request: NextRequest, name: string): number | undefined {
  const raw = request.nextUrl.searchParams.get(name);
  if (!raw) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) ? n : undefined;
}

export async function runGlpmCron<T>(
  request: NextRequest,
  hint: string,
  runner: () => Promise<T>
): Promise<NextResponse> {
  if (!isGlpmCronAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (request.nextUrl.searchParams.get("run") !== "true") {
    return NextResponse.json({ hint });
  }

  try {
    const result = await runner();
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
