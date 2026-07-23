export const MARKETING_PATHS = [
  "/",
  "/features",
  "/methodology",
  "/faq",
  "/pricing",
  "/signup",
  "/login",
  "/terms",
  "/privacy",
  "/disclaimer",
] as const;

export type MarketingPath = (typeof MARKETING_PATHS)[number];

export function isMarketingPath(pathname: string): boolean {
  if (MARKETING_PATHS.includes(pathname as MarketingPath)) {
    return true;
  }
  return false;
}

export const MARKETING_NAV_LINKS = [
  { href: "/features", label: "Features" },
  { href: "/methodology", label: "Methodology" },
  { href: "/pricing", label: "Pricing" },
  { href: "/faq", label: "FAQ" },
] as const;

export const APP_NAV_LINKS = [
  { href: "/home", label: "Home" },
  { href: "/predict", label: "Predict" },
  { href: "/league", label: "League" },
  { href: "/world-cup", label: "World Cup" },
  { href: "/predictions", label: "History" },
] as const;
