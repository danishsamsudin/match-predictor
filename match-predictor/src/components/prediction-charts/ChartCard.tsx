"use client";

import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/InfoTip";

export function ChartCard({
  title,
  description,
  children,
  className = "",
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`liquid-glass-pill rounded-2xl p-4 sm:p-5 ${className}`}
    >
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold text-foreground">{title}</h4>
          {description ? (
            <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export function ChartCardWithTip({
  title,
  tipLabel,
  tipBody,
  children,
  className = "",
}: {
  title: string;
  tipLabel: string;
  tipBody: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`liquid-glass-pill rounded-2xl p-4 sm:p-5 ${className}`}>
      <div className="mb-4 flex items-start justify-between gap-3">
        <h4 className="text-sm font-semibold text-foreground">{title}</h4>
        <InfoTip label={tipLabel}>{tipBody}</InfoTip>
      </div>
      {children}
    </div>
  );
}
