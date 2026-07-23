import Link from "next/link";
import type { ReactNode } from "react";

type DisclaimerBannerProps = {
  children?: ReactNode;
  className?: string;
};

export function DisclaimerBanner({ children, className = "" }: DisclaimerBannerProps) {
  return (
    <aside
      className={`rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-xs leading-relaxed text-amber-950 dark:border-amber-400/20 dark:bg-amber-400/10 dark:text-amber-100/90 ${className}`}
      role="note"
    >
      {children ?? (
        <>
          Estimates for entertainment and research only. Not betting or financial advice. Past
          results are not indicative of future results. 18+. See{" "}
          <Link href="/disclaimer" className="font-semibold underline underline-offset-2">
            disclaimer
          </Link>
          .
        </>
      )}
    </aside>
  );
}
