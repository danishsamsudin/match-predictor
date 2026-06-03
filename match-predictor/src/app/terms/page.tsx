import Link from "next/link";
import { PageHero } from "@/components/match-predictor/PageHero";
import { BRAND_NAME } from "@/lib/brand";

export const metadata = {
  title: "Terms & conditions",
};

export default function TermsPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHero eyebrow="Legal" title="Terms & conditions" />
      <div className="liquid-glass-panel space-y-4 rounded-2xl p-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        <p>
          {BRAND_NAME} provides statistical estimates for entertainment and research. Outputs
          are not guaranteed outcomes and must not be treated as financial or betting advice.
        </p>
        <p>
          You agree to use the service lawfully and not to scrape or overload our infrastructure.
          We may change features or data coverage without notice.
        </p>
        <p>
          The service is provided &quot;as is&quot; without warranties. To the extent permitted by
          law, we are not liable for losses arising from reliance on predictions.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          This page is a summary placeholder. Replace with counsel-reviewed terms before production
          launch.
        </p>
      </div>
      <Link
        href="/"
        className="mt-6 inline-block text-sm font-semibold text-indigo-600 dark:text-cyan-400"
      >
        ← Back to predict
      </Link>
    </div>
  );
}
