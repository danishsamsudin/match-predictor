"use client";

import Link from "next/link";
import { useState } from "react";
import {
  planPeriodLabel,
  planPriceLabel,
  PRICING_PLANS,
  PRICING_TRIAL_DAYS,
  type PricingBilling,
  type PricingPlanId,
} from "@/lib/marketing/pricing";

type PricingCardsProps = {
  selectedPlan?: PricingPlanId | null;
  ctaHref?: (planId: PricingPlanId, billing: PricingBilling) => string;
  showBillingToggle?: boolean;
  defaultBilling?: PricingBilling;
};

export function PricingCards({
  selectedPlan,
  ctaHref = (planId, billing) => `/signup?plan=${planId}&billing=${billing}`,
  showBillingToggle = true,
  defaultBilling = "monthly",
}: PricingCardsProps) {
  const [billing, setBilling] = useState<PricingBilling>(defaultBilling);

  return (
    <div>
      {showBillingToggle ? (
        <div className="mb-8 flex justify-center px-1">
          <div
            className="glass-chip inline-flex max-w-full flex-wrap justify-center rounded-full p-1"
            role="group"
            aria-label="Billing period"
          >
            {(["monthly", "annual"] as PricingBilling[]).map((option) => {
              const active = billing === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => setBilling(option)}
                  className={`min-h-11 rounded-full px-3 py-2 text-sm font-semibold transition sm:px-4 ${
                    active
                      ? "bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                      : "text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                  }`}
                >
                  {option === "monthly" ? (
                    "Monthly"
                  ) : (
                    <>
                      <span className="sm:hidden">Annual · save 2 mo</span>
                      <span className="hidden sm:inline">Annual · 2 months free</span>
                    </>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => {
          const highlighted = plan.highlighted;
          const isSelected = selectedPlan === plan.id;
          return (
            <article
              key={plan.id}
              className={`pricing-card glass-surface relative flex flex-col rounded-3xl p-5 sm:p-6 transition duration-300 ${
                highlighted ? "pricing-card-featured ring-2 ring-primary/40 md:col-span-2 lg:col-span-1" : ""
              } ${isSelected ? "outline outline-2 outline-offset-2 outline-primary" : ""}`}
            >
              {highlighted ? (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-950 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-white dark:bg-white dark:text-slate-950">
                  Most popular
                </span>
              ) : null}
              <div>
                <h3 className="text-xl font-bold text-foreground">{plan.name}</h3>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{plan.tagline}</p>
                <p className="mt-5 flex flex-wrap items-baseline gap-1">
                  <span className="text-4xl font-bold tracking-tight text-foreground">
                    {planPriceLabel(plan, billing)}
                  </span>
                  <span className="text-sm text-muted">{planPeriodLabel(billing)}</span>
                </p>
                {billing === "annual" ? (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                    Equivalent to {plan.priceLabel}/mo billed yearly
                  </p>
                ) : null}
                <p className="mt-2 text-xs font-medium text-primary">
                  {PRICING_TRIAL_DAYS}-day free trial after beta approval
                </p>
              </div>
              <ul className="mt-6 flex-1 space-y-2.5">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex gap-2 text-sm text-slate-700 dark:text-slate-300"
                  >
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>
              <Link
                href={ctaHref(plan.id, billing)}
                className={`mt-8 flex min-h-11 items-center justify-center rounded-full py-3 text-center text-sm font-bold transition ${
                  highlighted
                    ? "chromatic-cta bg-slate-950 text-white dark:bg-white dark:text-slate-950"
                    : "border border-glass-border bg-surface text-foreground hover:bg-surface-hover"
                }`}
              >
                {plan.cta}
              </Link>
            </article>
          );
        })}
      </div>
    </div>
  );
}
