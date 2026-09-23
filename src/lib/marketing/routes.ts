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

export type AppNavLink =
  | { href: string; label: string; children?: undefined }
  | {
      href?: undefined;
      label: string;
      children: readonly { href: string; label: string }[];
    };

export const APP_NAV_LINKS: readonly AppNavLink[] = [
  { href: "/home", label: "Home" },
  { href: "/predict", label: "Predict" },
  { href: "/league", label: "League" },
  {
    label: "Tournaments",
    children: [
      { href: "/nations-league", label: "Nations League 2026/27" },
      { href: "/world-cup", label: "World Cup 2026" },
    ],
  },
  { href: "/predictions", label: "History" },
] as const;
