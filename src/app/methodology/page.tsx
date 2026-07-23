import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "Methodology",
  description: `How ${BRAND_NAME} league models turn club context into market probabilities.`,
};

const INPUTS = [
  {
    title: "Form & history",
    body: "Recent club results and longer historical patterns help set a baseline for how teams create and concede chances.",
  },
  {
    title: "Lineups & availability",
    body: "Squad context matters. When lineup information is available, models can adjust for who is likely to start.",
  },
  {
    title: "Match conditions",
    body: "Weather and broader match context (rest, travel-style factors where available) refine expected game state - never as a single magic knob.",
  },
  {
    title: "Competition strength",
    body: "League-level strength framing keeps ratings comparable across competitions without pretending every league is identical.",
  },
];

const OUTPUTS = [
  {
    title: "xG-style estimates",
    body: "Expected goals style numbers summarise how many goals each side is estimated to create in the match.",
  },
  {
    title: "Score distributions",
    body: "Those estimates expand into a score matrix so individual scorelines and markets share one coherent story.",
  },
  {
    title: "Market probabilities",
    body: "1X2, BTTS, O/U, and related lines are derived from that distribution - research percentages, not tips.",
  },
  {
    title: "Fair-odds views",
    body: "Model probabilities can be shown as fair decimal prices so you can compare them to bookmaker odds you enter.",
  },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="Methodology"
        title="League models, explained without the secret sauce."
        description={`${BRAND_NAME} club models (GLPM family) turn league match context into probabilities. We describe categories of inputs and outputs - not weights, coefficients, or training recipes.`}
      />

      <DisclaimerBanner className="mt-8">
        Model outputs are statistical estimates for entertainment and research. They are not
        predictions of certainty, not betting advice, and not a claim that any algorithm
        &quot;works&quot; in every sample. You can lose money. 18+.
      </DisclaimerBanner>

      <section className="mt-12">
        <h2 className="text-2xl font-bold text-foreground">High-level pipeline</h2>
        <ol className="mt-6 grid gap-4 sm:grid-cols-4">
          {["Ratings", "xG-style estimates", "Score distribution", "Market probs"].map(
            (step, index) => (
              <li key={step} className="liquid-glass-panel rounded-2xl p-5 text-center">
                <p className="text-xs font-bold uppercase tracking-widest text-primary">
                  {index + 1}
                </p>
                <p className="mt-2 text-sm font-bold text-foreground">{step}</p>
              </li>
            )
          )}
        </ol>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold text-foreground">What goes in</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {INPUTS.map((item) => (
            <article key={item.title} className="liquid-glass-panel rounded-2xl p-5">
              <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="mt-12">
        <h2 className="text-2xl font-bold text-foreground">What comes out</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {OUTPUTS.map((item) => (
            <article key={item.title} className="liquid-glass-panel rounded-2xl p-5">
              <h3 className="text-lg font-bold text-foreground">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
                {item.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section className="liquid-glass-panel mt-12 rounded-2xl p-6">
        <h2 className="text-lg font-bold text-foreground">What we do not publish</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">
          Exact feature weights, proprietary coefficients, training recipes, and internal
          calibration knobs stay private. That protects the product and avoids implying a fixed
          formula that will always beat a market.
        </p>
      </section>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/features"
          className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold"
        >
          See features
        </Link>
        <Link
          href="/disclaimer"
          className="rounded-full px-5 py-2.5 text-sm font-semibold text-primary hover:underline"
        >
          Read disclaimer
        </Link>
      </div>
    </div>
  );
}
