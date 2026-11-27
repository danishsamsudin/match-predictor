export const MARKETING_PATHS = [
  "/",
  "/features",
  "/methodology",
  "/faq",
  "/pricing",
  "/about",
  "/compare",
  "/sources",
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

export type AppNavLink =
  | { href: string; label: string; children?: undefined }
  | {
      href?: undefined;
      label: string;
      children: readonly { href: string; label: string }[];
    };

/** Compact top-nav for marketing chrome. */
export const MARKETING_NAV_LINKS: readonly AppNavLink[] = [
  { href: "/features", label: "Features" },
  { href: "/pricing", label: "Pricing" },
  {
    label: "Research",
    children: [
      { href: "/methodology", label: "Methodology" },
      { href: "/sources", label: "Sources" },
      { href: "/compare", label: "Vs tipsters" },
    ],
  },
  {
    label: "Company",
    children: [
      { href: "/about", label: "About" },
      { href: "/faq", label: "FAQ" },
    ],
  },
] as const;

export const APP_NAV_LINKS: readonly AppNavLink[] = [
  { href: "/home", label: "Home" },
  { href: "/predict", label: "Predict" },
  { href: "/league", label: "xG" },
  {
    label: "Tournaments",
    children: [
      { href: "/nations-league", label: "Nations League 2026/27" },
      { href: "/world-cup", label: "World Cup 2026" },
    ],
  },
  { href: "/predictions", label: "History" },
] as const;

export type FooterLink = { href: string; label: string };

export type FooterColumn = {
  title: string;
  links: readonly FooterLink[];
};

export const FOOTER_COLUMNS: readonly FooterColumn[] = [
  {
    title: "Platform",
    links: [
      { href: "/home", label: "App home" },
      { href: "/predict", label: "Predict" },
      { href: "/league", label: "xG" },
      { href: "/predictions", label: "History" },
      { href: "/reports", label: "Reports" },
    ],
  },
  {
    title: "Coverage",
    links: [
      { href: "/features#coverage", label: "Premier League" },
      { href: "/features#coverage", label: "Eredivisie" },
      { href: "/features#coverage", label: "Serie A" },
      { href: "/features#coverage", label: "Bundesliga" },
      { href: "/features#coverage", label: "Championship" },
    ],
  },
  {
    title: "Research",
    links: [
      { href: "/features", label: "Features" },
      { href: "/methodology", label: "Methodology" },
      { href: "/sources", label: "Sources" },
      { href: "/compare", label: "Vs tipsters" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/pricing", label: "Pricing" },
      { href: "/faq", label: "FAQ" },
      { href: "/signup", label: "Request beta" },
      { href: "/login", label: "Sign in" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/privacy", label: "Privacy policy" },
      { href: "/terms", label: "Terms & conditions" },
      { href: "/disclaimer", label: "Disclaimer" },
    ],
  },
] as const;
