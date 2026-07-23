import { BRAND_CONTACT_EMAIL, BRAND_NAME } from "@/lib/brand";

export const CONTACT_EMAIL = BRAND_CONTACT_EMAIL;

export const FOOTER_DISCLAIMER =
  "Estimates for entertainment and research. Not betting or financial advice. 18+.";

export const SHORT_DISCLAIMER =
  `${BRAND_NAME} provides statistical estimates for entertainment and research only. Outputs are not guaranteed, are not betting or financial advice, and you can lose money. Past results are not indicative of future results. 18+ only.`;

export const LANDING_HEADLINE = "Match intel built for people who price games, not guess them.";

export const LANDING_SUPPORT =
  "Win probabilities, expected goals, and market lines from club form, lineups, weather, and history - so you can research fixtures with clearer numbers.";

export const LANDING_PROOF_PRIMARY =
  "Founder research bankroll grew ~10x over ~4 weeks during World Cup 2026.";

export const LANDING_PROOF_SECONDARY =
  "Started from a small test stake. One period, one workflow - not a typical month.";

export type ValidationMetric = {
  label: string;
  value: string;
  detail: string;
};

export const VALIDATION_METRICS: ValidationMetric[] = [
  {
    label: "Founder stretch",
    value: "~10x",
    detail: "Bankroll multiple in ~4 weeks (WC 2026 research window)",
  },
  {
    label: "Priced-edge hit rate",
    value: "~54-58%",
    detail: "Of +EV sides closed green in the sample window",
  },
  {
    label: "Closing-line beat",
    value: "~61%",
    detail: "Tracked prices that beat closing line",
  },
  {
    label: "Avg flagged edge",
    value: "+3.5% to +6%",
    detail: "Vs book when a line is surfaced",
  },
  {
    label: "Busy-week coverage",
    value: "40-70",
    detail: "Model lines surfaced in high-volume weeks",
  },
  {
    label: "Peak drawdown",
    value: "~18-25%",
    detail: "Same WC window - variance cuts both ways",
  },
  {
    label: "Time to read",
    value: "< 2 min",
    detail: "Median from fixture to model card",
  },
];

export const PROOF_LEGAL_NOTE =
  "Figures are founder / internal research samples, not audited performance or typical subscriber results. Past results are not indicative of future results. Limited sample size. High variance. Not betting advice.";
