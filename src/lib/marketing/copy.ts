import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";

export const CONTACT_EMAIL = BRAND_CONTACT_EMAIL;

export const FOOTER_DISCLAIMER =
  "Estimates for entertainment and research. Not betting or financial advice. 18+.";

export const SHORT_DISCLAIMER =
  `${BRAND_NAME} provides statistical estimates for entertainment and research only. Outputs are not guaranteed, are not betting or financial advice, and you can lose money. Past results are not indicative of future results. 18+ only.`;

export const LANDING_HEADLINE =
  "Match intel for people who research fixtures - not tipster noise.";

export const LANDING_SUPPORT =
  "Win probabilities, expected goals, fair odds, and Value Opportunities across five club leagues - built for entertainment and research, not advice.";

export const LANDING_PROOF_PRIMARY =
  "Model reliability across Premier League, Eredivisie, Serie A, Bundesliga, and Championship.";

export const LANDING_PROOF_SECONDARY =
  "Hit rates and calibration from locked league market evaluations - research metrics, not a betting P&L ledger.";

export const COVERAGE_LEAGUES = [
  "Premier League",
  "Eredivisie",
  "Serie A",
  "Bundesliga",
  "Championship",
] as const;

export const DATA_STACK_TEASER = [
  {
    name: "Match feeds",
    detail: "Fixtures, results, lineups, and event stats from primary football data providers.",
  },
  {
    name: "Odds & sharp lines",
    detail: "Book prices and sharp-book references for fair-odds and Value Opportunities compare.",
  },
  {
    name: "xG overlays",
    detail: "Season xG-style context where available to ground team strength reads.",
  },
  {
    name: "Weather",
    detail: "Match-city forecasts so conditions sit next to the model card.",
  },
] as const;

export type ValidationMetric = {
  label: string;
  value: string;
  detail: string;
};

/** Fallback tiles if baseline JSON is unavailable at build time. */
export const VALIDATION_METRICS: ValidationMetric[] = [
  {
    label: "League coverage",
    value: "5",
    detail: "Premier League, Eredivisie, Serie A, Bundesliga, Championship",
  },
  {
    label: "Market families",
    value: "1X2 · BTTS · O/U",
    detail: "Core lines from one coherent score story",
  },
  {
    label: "Research framing",
    value: "Model metrics",
    detail: "Hit rate and calibration - not subscriber betting P&L",
  },
  {
    label: "Access",
    value: "Beta",
    detail: "Signup, then approval before you can sign in",
  },
];

export const PROOF_LEGAL_NOTE =
  "Figures are model reliability research from locked league evaluations, not audited betting results or typical subscriber outcomes. Past results are not indicative of future results. Sample sizes vary by league and market. High variance. Not betting advice.";
