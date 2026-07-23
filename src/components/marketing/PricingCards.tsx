import Link from "next/link";
import { PRICING_PLANS, PRICING_TRIAL_DAYS, type PricingPlanId } from "@/lib/marketing/pricing";

type PricingCardsProps = {
  selectedPlan?: PricingPlanId | null;
  ctaHref?: (planId: PricingPlanId) => string;
};

export function PricingCards({
  selectedPlan,
  ctaHref = (planId) => `/signup?plan=${planId}`,
}: PricingCardsProps) {
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      {PRICING_PLANS.map((plan) => {
        const highlighted = plan.highlighted;
        const isSelected = selectedPlan === plan.id;
        return (
          <article
            key={plan.id}
            className={`pricing-card liquid-glass-panel relative flex flex-col rounded-3xl p-6 transition duration-300 ${
              highlighted ? "pricing-card-featured ring-2 ring-primary/40" : ""
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
              <p className="mt-5 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight text-foreground">
                  {plan.priceLabel}
                </span>
                <span className="text-sm text-muted">/ month</span>
              </p>
              <p className="mt-2 text-xs font-medium text-primary">
                {PRICING_TRIAL_DAYS}-day free trial on waitlist
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
              href={ctaHref(plan.id)}
              className={`mt-8 block rounded-full py-3 text-center text-sm font-bold transition ${
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
  );
}
