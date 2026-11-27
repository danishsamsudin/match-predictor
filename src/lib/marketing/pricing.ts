export type PricingPlanId = "pulse" | "edge" | "oracle";

export type PricingBilling = "monthly" | "annual";

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  priceMonthlyEur: number;
  priceLabel: string;
  priceAnnualEur: number;
  priceAnnualLabel: string;
  tagline: string;
  highlighted?: boolean;
  features: string[];
  cta: string;
};

export const PRICING_TRIAL_DAYS = 14;

/** Annual = 10× monthly (2 months free). */
export const ANNUAL_MONTHS_BILLED = 10;

function formatEur(amount: number): string {
  const fixed = Number.isInteger(amount) ? amount.toFixed(0) : amount.toFixed(2);
  return `€${fixed}`;
}

function annualPrice(monthly: number): number {
  return Math.round(monthly * ANNUAL_MONTHS_BILLED * 100) / 100;
}

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "pulse",
    name: "Pulse",
    priceMonthlyEur: 4.99,
    priceLabel: formatEur(4.99),
    priceAnnualEur: annualPrice(4.99),
    priceAnnualLabel: formatEur(annualPrice(4.99)),
    tagline: "Core match intel for everyday fixtures.",
    features: [
      "App hub with live scores and upcoming fixtures",
      "Limited league coverage",
      "1X2, BTTS, and O/U model lines",
      "Basic prediction history",
      `${PRICING_TRIAL_DAYS}-day free trial after approval`,
    ],
    cta: "Request beta access",
  },
  {
    id: "edge",
    name: "Edge",
    priceMonthlyEur: 14.99,
    priceLabel: formatEur(14.99),
    priceAnnualEur: annualPrice(14.99),
    priceAnnualLabel: formatEur(annualPrice(14.99)),
    tagline: "Full league workflow for sharper research.",
    highlighted: true,
    features: [
      "Everything in Pulse",
      "Full League Hub access across five leagues",
      "Handicaps and props where available",
      "Fair odds, +EV compare, and Value Opportunities",
      "Full prediction history",
      `${PRICING_TRIAL_DAYS}-day free trial after approval`,
    ],
    cta: "Request beta access",
  },
  {
    id: "oracle",
    name: "Oracle",
    priceMonthlyEur: 29.99,
    priceLabel: formatEur(29.99),
    priceAnnualEur: annualPrice(29.99),
    priceAnnualLabel: formatEur(annualPrice(29.99)),
    tagline: "Full stack plus AI research assistant.",
    features: [
      "Everything in Edge",
      "AI chat assistant for match Q&A and research prompts",
      "Priority model refresh language",
      "Recommendations framed as research-only estimates",
      `${PRICING_TRIAL_DAYS}-day free trial after approval`,
    ],
    cta: "Request beta access",
  },
];

export function getPricingPlan(id: string | null | undefined): PricingPlan | undefined {
  if (!id) return undefined;
  return PRICING_PLANS.find((plan) => plan.id === id);
}

export function planPriceLabel(plan: PricingPlan, billing: PricingBilling): string {
  return billing === "annual" ? plan.priceAnnualLabel : plan.priceLabel;
}

export function planPeriodLabel(billing: PricingBilling): string {
  return billing === "annual" ? "/ year" : "/ month";
}
