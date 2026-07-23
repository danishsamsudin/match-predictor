export type PricingPlanId = "pulse" | "edge" | "oracle";

export type PricingPlan = {
  id: PricingPlanId;
  name: string;
  priceMonthlyEur: number;
  priceLabel: string;
  tagline: string;
  highlighted?: boolean;
  features: string[];
  cta: string;
};

export const PRICING_TRIAL_DAYS = 14;

export const PRICING_PLANS: PricingPlan[] = [
  {
    id: "pulse",
    name: "Pulse",
    priceMonthlyEur: 4.99,
    priceLabel: "€4.99",
    tagline: "Core match intel for everyday fixtures.",
    features: [
      "App hub with live scores and upcoming fixtures",
      "Limited league coverage",
      "1X2, BTTS, and O/U model lines",
      "Basic prediction history",
      `${PRICING_TRIAL_DAYS}-day free trial`,
    ],
    cta: "Join waitlist",
  },
  {
    id: "edge",
    name: "Edge",
    priceMonthlyEur: 14.99,
    priceLabel: "€14.99",
    tagline: "Full league workflow for sharper research.",
    highlighted: true,
    features: [
      "Everything in Pulse",
      "Full League Hub access",
      "Handicaps and props where available",
      "Fair odds and +EV compare tools",
      "Full prediction history",
      `${PRICING_TRIAL_DAYS}-day free trial`,
    ],
    cta: "Join waitlist",
  },
  {
    id: "oracle",
    name: "Oracle",
    priceMonthlyEur: 29.99,
    priceLabel: "€29.99",
    tagline: "Full stack plus AI research assistant.",
    features: [
      "Everything in Edge",
      "AI chat assistant for match Q&A and research prompts",
      "Priority model refresh language",
      "Recommendations framed as research-only estimates",
      `${PRICING_TRIAL_DAYS}-day free trial`,
    ],
    cta: "Join waitlist",
  },
];

export function getPricingPlan(id: string | null | undefined): PricingPlan | undefined {
  if (!id) return undefined;
  return PRICING_PLANS.find((plan) => plan.id === id);
}
