import Link from "next/link";
import { PageHero } from "@/components/match-predictor/PageHero";
import { BRAND_NAME } from "@/lib/brand";

export const metadata = {
  title: "Privacy policy",
};

export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <PageHero eyebrow="Legal" title="Privacy policy" />
      <div className="liquid-glass-panel space-y-4 rounded-2xl p-6 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        <p>
          {BRAND_NAME} stores prediction inputs and results you generate so you can view history.
          We do not sell personal data. Contact the site operator to request deletion of saved
          predictions tied to your account or session.
        </p>
        <p>
          Third-party data providers used for match statistics and weather are listed on our{" "}
          <Link href="/sources" className="font-semibold text-indigo-600 dark:text-cyan-400">
            data sources
          </Link>{" "}
          page. Those services have their own privacy policies.
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-500">
          This page is a summary placeholder. Replace with counsel-reviewed text before production
          launch if you collect accounts or payments.
        </p>
      </div>
      <Link
        href="/predict"
        className="mt-6 inline-block text-sm font-semibold text-indigo-600 dark:text-cyan-400"
      >
        ← Back to predict
      </Link>
    </div>
  );
}
