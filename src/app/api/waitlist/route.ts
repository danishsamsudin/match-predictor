import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { tryCreateServiceClient } from "@/lib/supabase";
import { getPricingPlan, type PricingPlanId } from "@/lib/marketing/pricing";

export const runtime = "nodejs";

type WaitlistBody = {
  email?: string;
  username?: string;
  fullName?: string;
  phone?: string;
  country?: string;
  plan?: string;
  source?: string;
  marketingOptIn?: boolean;
  ageConfirmed?: boolean;
  acceptTerms?: boolean;
  acceptPrivacy?: boolean;
  acceptDisclaimer?: boolean;
  passwordProvided?: boolean;
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const rateBucket = new Map<string, { count: number; resetAt: number }>();

function clientKey(request: Request): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

function allowRequest(key: string): boolean {
  const now = Date.now();
  const existing = rateBucket.get(key);
  if (!existing || existing.resetAt < now) {
    rateBucket.set(key, { count: 1, resetAt: now + 60_000 });
    return true;
  }
  if (existing.count >= 12) {
    return false;
  }
  existing.count += 1;
  return true;
}

async function insertWaitlistRow(
  client: SupabaseClient,
  row: Record<string, unknown>
): Promise<string | null> {
  // Table added in migration 046; not yet in generated Database types.
  const untyped = client as unknown as {
    from: (table: string) => {
      insert: (
        values: Record<string, unknown>
      ) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
  const { error } = await untyped.from("waitlist_signups").insert(row);
  return error?.message ?? null;
}

export async function POST(request: Request) {
  if (!allowRequest(clientKey(request))) {
    return NextResponse.json({ error: "Too many requests. Try again shortly." }, { status: 429 });
  }

  let body: WaitlistBody;
  try {
    body = (await request.json()) as WaitlistBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const email = body.email?.trim().toLowerCase() ?? "";
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }

  const planId = (body.plan ?? "edge") as PricingPlanId;
  if (!getPricingPlan(planId)) {
    return NextResponse.json({ error: "Invalid plan." }, { status: 400 });
  }

  const source = (body.source ?? "pricing").slice(0, 40);
  const isSignup = source === "signup";

  if (isSignup) {
    if (!body.username?.trim() || !body.fullName?.trim() || !body.phone?.trim() || !body.country?.trim()) {
      return NextResponse.json({ error: "Missing required signup fields." }, { status: 400 });
    }
    if (!body.ageConfirmed || !body.acceptTerms || !body.acceptPrivacy || !body.acceptDisclaimer) {
      return NextResponse.json(
        { error: "Age confirmation and legal acceptances are required." },
        { status: 400 }
      );
    }
  }

  const row = {
    email,
    username: body.username?.trim() || null,
    full_name: body.fullName?.trim() || null,
    phone: body.phone?.trim() || null,
    country: body.country?.trim() || null,
    plan: planId,
    source,
    marketing_opt_in: Boolean(body.marketingOptIn),
    age_confirmed: body.ageConfirmed ?? null,
    accept_terms: body.acceptTerms ?? null,
    accept_privacy: body.acceptPrivacy ?? null,
    accept_disclaimer: body.acceptDisclaimer ?? null,
    password_provided: Boolean(body.passwordProvided),
  };

  const client = tryCreateServiceClient();
  if (client) {
    const errorMessage = await insertWaitlistRow(client as SupabaseClient, row);
    if (errorMessage) {
      console.error("[waitlist] insert failed", errorMessage);
    }
  }

  return NextResponse.json({ ok: true });
}
