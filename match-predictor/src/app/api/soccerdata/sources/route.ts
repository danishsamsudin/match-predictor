import { NextResponse } from "next/server";
import { SOCCERDATA_SOURCE_CATALOG } from "@/lib/api/soccerdata/registry";
import {
  getSoccerdataCacheDir,
  getSoccerdataPythonBin,
  getSoccerdataRunnerPath,
  isSoccerdataEnabled,
} from "@/lib/config/soccerdata";

export async function GET() {
  return NextResponse.json({
    enabled: isSoccerdataEnabled(),
    docsUrl: "https://soccerdata.readthedocs.io/en/latest/intro.html",
    python: getSoccerdataPythonBin(),
    runner: getSoccerdataRunnerPath(),
    cacheDir: getSoccerdataCacheDir() ?? "~/soccerdata (default)",
    sources: SOCCERDATA_SOURCE_CATALOG,
  });
}
