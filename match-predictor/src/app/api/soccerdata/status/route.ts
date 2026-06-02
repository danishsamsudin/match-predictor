import { NextResponse } from "next/server";
import { fetchSoccerdataAvailableLeagues } from "@/lib/api/soccerdata/service";
import {
  getSoccerdataCacheDir,
  getSoccerdataFetchTimeoutMs,
  getSoccerdataPythonBin,
  getSoccerdataRunnerPath,
  isSoccerdataEnabled,
} from "@/lib/config/soccerdata";
import { UpstreamApiError } from "@/lib/types/prediction";

export async function GET() {
  if (!isSoccerdataEnabled()) {
    return NextResponse.json({
      ok: false,
      enabled: false,
      message: "SoccerData integration is disabled.",
    });
  }

  try {
    const leagues = await fetchSoccerdataAvailableLeagues("FBref");
    return NextResponse.json({
      ok: true,
      enabled: true,
      python: getSoccerdataPythonBin(),
      runner: getSoccerdataRunnerPath(),
      cacheDir: getSoccerdataCacheDir(),
      timeoutMs: getSoccerdataFetchTimeoutMs(),
      sampleLeagues: leagues.slice(0, 8),
      message: "SoccerData runner is working (FBref.available_leagues).",
    });
  } catch (error) {
    const message =
      error instanceof UpstreamApiError
        ? error.message
        : "SoccerData health check failed.";
    return NextResponse.json(
      {
        ok: false,
        enabled: true,
        python: getSoccerdataPythonBin(),
        runner: getSoccerdataRunnerPath(),
        message,
        setup:
          "pip install -r services/soccerdata/requirements.txt (see README SoccerData section)",
      },
      { status: 502 }
    );
  }
}
