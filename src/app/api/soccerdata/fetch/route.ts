import { NextResponse } from "next/server";
import { fetchSoccerdata } from "@/lib/api/soccerdata/service";
import type { SoccerdataFetchRequest } from "@/lib/api/soccerdata/types";
import { SOCCERDATA_SOURCES } from "@/lib/api/soccerdata/types";
import { isSoccerdataEnabled } from "@/lib/config/soccerdata";
import { UpstreamApiError } from "@/lib/types/prediction";

export async function POST(request: Request) {
  if (!isSoccerdataEnabled()) {
    return NextResponse.json(
      { ok: false, message: "SoccerData is disabled (SOCCERDATA_ENABLED=false)." },
      { status: 503 }
    );
  }

  let body: Partial<SoccerdataFetchRequest>;
  try {
    body = (await request.json()) as Partial<SoccerdataFetchRequest>;
  } catch {
    return NextResponse.json({ ok: false, message: "Invalid JSON body." }, { status: 400 });
  }

  const source = body.source;
  const method = body.method;
  if (!source || !method) {
    return NextResponse.json(
      { ok: false, message: "Body must include 'source' and 'method'." },
      { status: 400 }
    );
  }
  if (!SOCCERDATA_SOURCES.includes(source)) {
    return NextResponse.json({ ok: false, message: `Unknown source: ${source}` }, { status: 400 });
  }

  try {
    const result = await fetchSoccerdata({
      source,
      method,
      constructor: body.constructor,
      params: body.params,
      persist: body.persist ?? true,
      skipCache: body.skipCache ?? false,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const message =
      error instanceof UpstreamApiError ? error.message : "SoccerData fetch failed.";
    const status = error instanceof UpstreamApiError ? 502 : 500;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
