import { NextResponse } from "next/server";
import { verifyBetaCredentials } from "@/lib/auth/beta-access";
import { requireAuthConfig } from "@/lib/auth/config";
import { verifyCredentials } from "@/lib/auth/credentials";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: { username?: string; password?: string };
  try {
    body = (await request.json()) as { username?: string; password?: string };
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const username = body.username?.trim() ?? "";
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required" }, { status: 400 });
  }

  let config;
  try {
    config = requireAuthConfig();
  } catch {
    return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
  }

  // Operator override from env.
  if (verifyCredentials(username, password)) {
    const token = await createSessionToken(config.username, config.secret);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, token);
    return response;
  }

  const beta = await verifyBetaCredentials(username, password);
  if (beta.ok) {
    const token = await createSessionToken(beta.username, config.secret);
    const response = NextResponse.json({ ok: true });
    setSessionCookie(response, token);
    return response;
  }

  if (beta.code === "pending") {
    return NextResponse.json(
      {
        error:
          "Your beta request is still pending approval. You will be able to sign in once accepted.",
        code: "pending",
      },
      { status: 403 }
    );
  }

  if (beta.code === "rejected") {
    return NextResponse.json(
      { error: "This beta request was not approved.", code: "rejected" },
      { status: 403 }
    );
  }

  return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
}
