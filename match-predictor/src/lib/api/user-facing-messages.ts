/** RapidAPI quota, billing, and provider CTAs — never show in the product UI. */
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
    lower.includes("subscribe on rapidapi") ||
    (lower.includes("sportapi7") &&
      (lower.includes("subscribe") || lower.includes("not connected") || lower.includes("rapidapi")))
  );
}

export function sanitizeUserFacingMessage(text: string | null | undefined): string | null {
  if (!text?.trim()) return null;
  if (shouldHideUserFacingWarning(text)) return null;
  return text;
}
