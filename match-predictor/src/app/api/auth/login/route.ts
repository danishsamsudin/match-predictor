import { NextResponse } from "next/server";
import { requireAuthConfig } from "@/lib/auth/config";
import { verifyCredentials } from "@/lib/auth/credentials";
import { createSessionToken, setSessionCookie } from "@/lib/auth/session";

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

  if (!verifyCredentials(username, password)) {
    return NextResponse.json({ error: "Invalid username or password" }, { status: 401 });
  }

  const token = await createSessionToken(config.username, config.secret);
  const response = NextResponse.json({ ok: true });
  setSessionCookie(response, token);
  return response;
}
