import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL } from "@/lib/marketing/copy";
import { PRICING_PLANS, PRICING_TRIAL_DAYS } from "@/lib/marketing/pricing";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Common questions about ${BRAND_NAME} pricing, accuracy, and liability.`,
};

const FAQS: { q: string; a: ReactNode }[] = [
  {
    q: "Is DynamixG betting advice?",
    a: (
      <>
        No. {BRAND_NAME} provides statistical estimates for entertainment and research only. We do
        not tell you what to stake, and we are not responsible for gains or losses. See the{" "}
        <Link href="/disclaimer" className="font-semibold text-primary underline">
          disclaimer
        </Link>
        .
      </>
    ),
  },
  {
    q: "Who is this for?",
    a: "Adults 18+ who research football markets and want clearer model probabilities, expected goals style estimates, and fair-odds style comparisons - not tipster hype.",
  },
  {
    q: "What about the World Cup founder results?",
    a: "Founders tracked a research bankroll that grew ~10x over about four weeks during World Cup 2026. That was a single research window with real drawdowns as well. It is not a forecast, not typical results, and not a guarantee. Past performance is not indicative of future results.",
  },
  {
    q: "How accurate are the models?",
    a: "No model is perfectly calibrated every week. Hit rates on priced edges in our founder sample sat in a modest band (roughly mid-50%s), with drawdowns. Expect variance. Treat every line as an estimate.",
  },
  {
    q: "What is included in each tier?",
    a: (
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {PRICING_PLANS.map((plan) => (
          <li key={plan.id}>
            <span className="font-semibold text-foreground">
              {plan.name} ({plan.priceLabel}/mo)
            </span>
            : {plan.tagline}
          </li>
        ))}
      </ul>
    ),
  },
  {
    q: "Do you offer a free trial?",
    a: `Yes - a ${PRICING_TRIAL_DAYS}-day free trial is planned for every paid tier via the waitlist. No card capture on this waitlist form.`,
  },
  {
    q: "Can I sign up and use the app today?",
    a: (
      <>
        Waitlist signup collects your details for invite-based access. If you already have
        credentials,{" "}
        <Link href="/login" className="font-semibold text-primary underline">
          sign in
        </Link>
        . Full multi-user accounts ship in a later pass.
      </>
    ),
  },
  {
    q: "Where does the data come from?",
    a: (
      <>
        Match statistics and weather come from third-party providers. See{" "}
        <Link href="/sources" className="font-semibold text-primary underline">
          data sources
        </Link>{" "}
        (requires sign-in) for the current list.
      </>
    ),
  },
  {
    q: "How do I contact you?",
    a: (
      <>
        Email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-primary underline">
          {CONTACT_EMAIL}
        </a>
        .
      </>
    ),
  },
];

export default function FaqPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="FAQ"
        title="Straight answers before you join."
        description="Legal clarity first. Product second."
      />

      <div className="mt-10 space-y-4">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="liquid-glass-panel group rounded-2xl p-5 open:pb-5"
          >
            <summary className="cursor-pointer list-none text-base font-bold text-foreground marker:content-none">
              <span className="flex items-center justify-between gap-3">
                {item.q}
                <span className="text-muted transition group-open:rotate-45">+</span>
              </span>
            </summary>
            <div className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
              {item.a}
            </div>
          </details>
        ))}
      </div>

      <DisclaimerBanner className="mt-8" />

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
        >
          Join waitlist
        </Link>
        <Link href="/pricing" className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold">
          View pricing
        </Link>
      </div>
    </div>
  );
}
