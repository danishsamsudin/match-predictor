import { after } from "next/server";
import { NextResponse } from "next/server";
import { loadHubSnapshotMeta } from "@/lib/world-cup/hub-snapshot";
import {
  executeWorldCupHubRefresh,
  triggerWorldCupHubRefresh,
} from "@/lib/world-cup/hub-refresh";

export const runtime = "nodejs";
export const maxDuration = 300;

/** Refresh status + cooldown for the hub refresh button. */
export async function GET() {
  const meta = await loadHubSnapshotMeta();
  return NextResponse.json(meta);
}

/** Manual hub refresh (10-minute cooldown). Session auth enforced by middleware. */
export async function POST() {
  const trigger = await triggerWorldCupHubRefresh();

  if (!trigger.ok && trigger.retryAfterSeconds) {
    return NextResponse.json(
      {
        error: trigger.reason,
        retryAfterSeconds: trigger.retryAfterSeconds,
      },
      { status: 429 }
    );
  }

  if (!trigger.ok) {
    if (trigger.reason.includes("already in progress")) {
      return NextResponse.json({ error: trigger.reason }, { status: 409 });
    }
    return NextResponse.json({ error: trigger.reason }, { status: 500 });
  }

  after(async () => {
    await executeWorldCupHubRefresh("manual");
  });

  return NextResponse.json(
    {
      started: true,
      message: "Hub refresh started. This may take several minutes.",
    },
    { status: 202 }
  );
}
