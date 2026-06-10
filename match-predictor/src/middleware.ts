import { NextResponse, type NextRequest } from "next/server";
import { getAuthConfig } from "@/lib/auth/config";
import { getSessionTokenFromRequest, verifySessionToken } from "@/lib/auth/session";

function isPublicPath(pathname: string): boolean {
  if (pathname === "/") {
    return true;
  }
  if (pathname === "/api/auth/login") {
    return true;
  }
  if (pathname.startsWith("/api/cron/")) {
    return true;
  }
  return false;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const config = getAuthConfig();

  if (!config) {
    if (pathname.startsWith("/api/") && !isPublicPath(pathname)) {
      return NextResponse.json({ error: "Authentication is not configured" }, { status: 503 });
    }
    return NextResponse.next();
  }

  const token = getSessionTokenFromRequest(request);
  const session = token ? await verifySessionToken(token, config.secret) : null;
  const isAuthenticated = session !== null;

  if (isAuthenticated && pathname === "/") {
    return NextResponse.redirect(new URL("/predict", request.url));
  }

  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const loginUrl = new URL("/", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("next", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
