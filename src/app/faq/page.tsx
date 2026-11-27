import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { JsonLd } from "@/components/marketing/JsonLd";
import { BRAND_NAME } from "@/lib/brand";
import { CONTACT_EMAIL, COVERAGE_LEAGUES } from "@/lib/marketing/copy";
import { PRICING_PLANS, PRICING_TRIAL_DAYS } from "@/lib/marketing/pricing";

export const metadata: Metadata = {
  title: "FAQ",
  description: `Common questions about ${BRAND_NAME} beta access, pricing, accuracy, and liability.`,
  alternates: { canonical: "/faq" },
};

export const revalidate = 3600;

const FAQS: { q: string; a: ReactNode; plain: string }[] = [
  {
    q: "Is DynamixG betting advice?",
    plain:
      "No. DynamixG provides statistical estimates for entertainment and research only. We do not tell you what to stake.",
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
    plain:
      "Adults 18+ who research football markets and want clearer model probabilities - not tipster hype.",
    a: "Adults 18+ who research football markets and want clearer model probabilities, expected goals style estimates, and fair-odds style comparisons - not tipster hype.",
  },
  {
    q: "Which leagues do you cover?",
    plain: `Club research focuses on ${COVERAGE_LEAGUES.join(", ")}.`,
    a: `Club research focuses on ${COVERAGE_LEAGUES.join(", ")}.`,
  },
  {
    q: "How accurate are the models?",
    plain:
      "No model is perfectly calibrated every week. We publish league reliability hit rates for BTTS, O/U 2.5, 1X2, and DC from locked baselines as research metrics, not betting P&L.",
    a: (
      <>
        No model is perfectly calibrated every week. We publish league reliability hit rates for
        core markets (BTTS, O/U 2.5, 1X2, and DC) from locked baselines as research metrics - not a
        subscriber betting ledger.
        See the landing performance table and{" "}
        <Link href="/methodology" className="font-semibold text-primary underline">
          methodology
        </Link>
        . Expect variance.
      </>
    ),
  },
  {
    q: "What is included in each tier?",
    plain: PRICING_PLANS.map((p) => `${p.name}: ${p.tagline}`).join(" "),
    a: (
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {PRICING_PLANS.map((plan) => (
          <li key={plan.id}>
            <span className="font-semibold text-foreground">
              {plan.name} ({plan.priceLabel}/mo or {plan.priceAnnualLabel}/yr)
            </span>
            : {plan.tagline}
          </li>
        ))}
      </ul>
    ),
  },
  {
    q: "Do you offer annual pricing?",
    plain: "Yes. Annual billing is priced as 10 months (2 months free versus monthly).",
    a: "Yes. Annual billing is priced as 10 months (2 months free versus monthly). Toggle monthly/annual on the pricing page.",
  },
  {
    q: `Do you offer a free trial?`,
    plain: `A ${PRICING_TRIAL_DAYS}-day free trial is planned for every paid tier after beta approval.`,
    a: `A ${PRICING_TRIAL_DAYS}-day free trial is planned for every paid tier after beta approval. No card capture on the beta request form.`,
  },
  {
    q: "How does beta access work?",
    plain:
      "Request access on signup. We review applications and set your account to accepted before you can sign in.",
    a: (
      <>
        Request access on{" "}
        <Link href="/signup" className="font-semibold text-primary underline">
          signup
        </Link>
        . We review applications and mark accounts accepted before you can{" "}
        <Link href="/login" className="font-semibold text-primary underline">
          sign in
        </Link>
        . Pending accounts cannot use the app yet.
      </>
    ),
  },
  {
    q: "Where does the data come from?",
    plain: "Match statistics, odds, and weather come from third-party providers listed on Sources.",
    a: (
      <>
        Match statistics, odds, and weather come from third-party providers. See{" "}
        <Link href="/sources" className="font-semibold text-primary underline">
          data sources
        </Link>
        .
      </>
    ),
  },
  {
    q: "How do I contact you?",
    plain: `Email ${CONTACT_EMAIL}.`,
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
  const faqLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: FAQS.map((item) => ({
      "@type": "Question",
      name: item.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.plain,
      },
    })),
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <JsonLd data={faqLd} />
      <SectionHeading
        eyebrow="FAQ"
        title="Straight answers before you join."
        description="Legal clarity first. Product second."
      />

      <div className="mt-10 space-y-4">
        {FAQS.map((item) => (
          <details
            key={item.q}
            className="glass-surface group rounded-2xl p-5 open:pb-5"
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
          Request beta access
        </Link>
        <Link
          href="/pricing"
          className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold"
        >
          View pricing
        </Link>
      </div>
    </div>
  );
}
