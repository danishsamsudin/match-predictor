export const BRAND_NAME = "DynamixG";

export const BRAND_TAGLINE =
  "Win probabilities, expected goals, and match insights built from form, lineups, weather, and historical results.";

export const BRAND_HERO_EYEBROW = "Dynamic match intelligence";

export const BRAND_HERO_SUBTITLE =
  "Generate win probabilities, expected goals, and match stat estimates with advanced form models and live context.";

export function brandPageTitle(page: string): string {
  return `${page} | ${BRAND_NAME}`;
}
