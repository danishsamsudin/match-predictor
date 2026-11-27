import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { ProductPreview } from "@/components/marketing/ProductPreview";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";
import { COVERAGE_LEAGUES, CONTACT_EMAIL } from "@/lib/marketing/copy";

export const metadata: Metadata = {
  title: "About",
  description: `What ${BRAND_NAME} builds: league-first football research, transparent standards, and beta access.`,
  alternates: { canonical: "/about" },
};

export const revalidate = 3600;

const STANDARDS = [
  {
    title: "One coherent score story",
    body: "Related markets should not contradict each other. Probabilities share one underlying match narrative.",
  },
  {
    title: "Research, not tips",
    body: "We publish estimates and compare tools. We do not sell certainty, guaranteed edges, or stake instructions.",
  },
  {
    title: "League-native coverage",
    body: `Focus stays on ${COVERAGE_LEAGUES.join(", ")} - the weekly club grind you actually research.`,
  },
  {
    title: "Protect the model",
    body: "We describe inputs and outputs. Weights, coefficients, and training recipes stay private.",
  },
];

export default function AboutPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="About"
        title={`${BRAND_NAME} builds football research tools.`}
        description="We turn club match context into win probabilities, expected goals style estimates, fair odds, and Value Opportunities - for adults who price games carefully."
      />

      <section className="mt-12 max-w-3xl space-y-4 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
        <p>
          DynamixG started as a serious research stack for club football: ingest match context,
          rate teams, expand into score distributions, and surface market lines you can compare to
          books. The product is entertainment and research software - not a tipster service and not
          financial advice.
        </p>
        <p>
          Access is beta-gated. You request access, we review, and approved accounts can sign in.
          Billing opens later; today&apos;s signup is about joining the research beta cleanly.
        </p>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-foreground">Standards we hold</h2>
        <ul className="mt-6 grid gap-6 sm:grid-cols-2">
          {STANDARDS.map((item) => (
            <li key={item.title} className="border-l-2 border-primary/40 pl-4">
              <h3 className="text-base font-bold text-foreground">{item.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {item.body}
              </p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-14">
        <h2 className="text-2xl font-bold text-foreground">What you see in product</h2>
        <div className="mt-6">
          <ProductPreview />
        </div>
      </section>

      <DisclaimerBanner className="mt-10" />

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
        >
          Request beta access
        </Link>
        <a
          href={`mailto:${CONTACT_EMAIL}`}
          className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold"
        >
          Contact
        </a>
      </div>
    </div>
  );
}
