import type { Metadata } from "next";
import Link from "next/link";
import { DisclaimerBanner } from "@/components/marketing/DisclaimerBanner";
import { SectionHeading } from "@/components/marketing/SectionHeading";
import { BRAND_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: "DynamixG vs tipsters",
  description: `How ${BRAND_NAME} differs from tipster services: model probabilities, fair odds, and research tooling - not pick lists.`,
  alternates: { canonical: "/compare" },
};

export const revalidate = 3600;

const ROWS = [
  {
    topic: "Output",
    tipster: "Picks, locks, and confidence theatre",
    us: "Probabilities, fair odds, and Value Opportunities framed as research",
  },
  {
    topic: "Accountability",
    tipster: "Selective screenshots; hard to audit full samples",
    us: "League reliability baselines on locked model lines (research metrics, not P&L)",
  },
  {
    topic: "Workflow",
    tipster: "Follow the tip",
    us: "Compare model vs book, then decide - Bet / Watch / Pass language stays informational",
  },
  {
    topic: "Markets",
    tipster: "Often a single side",
    us: "Coherent 1X2, BTTS, O/U, handicaps where covered - one score story",
  },
  {
    topic: "Formulas",
    tipster: "Black box hype",
    us: "Public methodology categories; coefficients stay private",
  },
  {
    topic: "Liability",
    tipster: "Implied certainty",
    us: "Explicit entertainment / research disclaimer; 18+; you can lose money",
  },
];

export default function ComparePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10 sm:px-6 sm:py-12">
      <SectionHeading
        eyebrow="Compare"
        title="Not another tipster feed."
        description={`${BRAND_NAME} is a research platform. Tipsters sell picks. We surface model probabilities and tools so you can research fixtures yourself.`}
      />

      <div className="mt-10 overflow-x-auto table-h-scroll">
        <table className="w-full min-w-[40rem] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-glass-border text-[11px] font-semibold uppercase tracking-widest text-muted">
              <th className="py-3 pr-4 font-semibold">Topic</th>
              <th className="py-3 pr-4 font-semibold">Typical tipster</th>
              <th className="py-3 font-semibold">{BRAND_NAME}</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.topic} className="border-b border-glass-border/70 align-top">
                <td className="py-4 pr-4 font-semibold text-foreground">{row.topic}</td>
                <td className="py-4 pr-4 text-slate-600 dark:text-slate-400">{row.tipster}</td>
                <td className="py-4 text-foreground">{row.us}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <DisclaimerBanner className="mt-8" />

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/signup"
          className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-bold text-white dark:bg-white dark:text-slate-950"
        >
          Request beta access
        </Link>
        <Link
          href="/methodology"
          className="rounded-full border border-glass-border bg-surface px-5 py-2.5 text-sm font-semibold"
        >
          Read methodology
        </Link>
      </div>
    </div>
  );
}
