/** Ops, provider, and config messages — never show in the product UI. */
export function shouldHideUserFacingWarning(text: string | undefined | null): boolean {
  if (!text?.trim()) return false;
  const lower = text.toLowerCase();
  return (
    lower.includes("quota") ||
    lower.includes("rate limit") ||
    lower.includes("exceeded the") ||
    lower.includes("rapidapi.com") ||
    lower.includes("upgrade your plan") ||
    lower.includes("not subscribed") ||
    lower.includes("rapidapi key") ||
    lower.includes("rapidapi_key") ||
    lower.includes("subscribe on rapidapi") ||
    lower.includes("sofascore") ||
    lower.includes("sportapi") ||
    lower.includes("health check") ||
    lower.includes("connection failed") ||
    lower.includes("upstream") ||
    lower.includes("mock mode") ||
    lower.includes("placeholder football") ||
    lower.includes("data_source") ||
    lower.includes("supabase") ||
    lower.includes("migration") ||
    lower.includes("env var") ||
    lower.includes("vercel") ||
    lower.includes("deployment") ||
    lower.includes("sync has not") ||
    lower.includes("daily sync") ||
    lower.includes("not configured") ||
    (lower.includes("sportapi7") &&
      (lower.includes("subscribe") || lower.includes("not connected") || lower.includes("rapidapi")))
  );
}

export function sanitizeUserFacingMessage(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  if (shouldHideUserFacingWarning(text)) return null;
  return text;
}
