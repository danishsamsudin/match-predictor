import Link from "next/link";
import type { ReactNode } from "react";

type MarketingCtaProps = {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
};

const base =
  "inline-flex min-h-11 items-center justify-center rounded-full px-5 py-2.5 text-sm font-bold transition sm:px-6 sm:py-3";

export function MarketingCta({
  href,
  children,
  variant = "primary",
  className = "",
}: MarketingCtaProps) {
  if (variant === "secondary") {
    return (
      <Link
        href={href}
        className={`${base} border border-glass-border bg-surface font-semibold text-foreground hover:bg-surface-hover ${className}`}
      >
        {children}
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={`${base} chromatic-cta bg-slate-950 text-white dark:bg-white dark:text-slate-950 ${className}`}
    >
      {children}
    </Link>
  );
}
