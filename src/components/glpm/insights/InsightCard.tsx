"use client";

import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  GLPM_CX_GLOSSARY,
  type GlossaryKey,
  glossaryTipBody,
} from "@/lib/glpm-cx/glossary";

export function InsightCard({
  title,
  howToRead,
  glossaryKey,
  tipLabel,
  tipBody,
  children,
  className = "",
  badge,
}: {
  title: string;
  /** One sentence explaining how to read the chart */
  howToRead?: string;
  glossaryKey?: GlossaryKey;
  tipLabel?: string;
  tipBody?: ReactNode;
  children: ReactNode;
  className?: string;
  badge?: ReactNode;
}) {
  const entry = glossaryKey ? GLPM_CX_GLOSSARY[glossaryKey] : null;
  const label = tipLabel ?? entry?.label ?? title;
  const body = tipBody ?? (glossaryKey ? glossaryTipBody(glossaryKey) : null);
  const caption = howToRead ?? entry?.what;

  return (
    <div
      className={`liquid-glass-pill min-w-0 max-w-full overflow-hidden rounded-2xl p-4 sm:p-5 ${className}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="text-sm font-semibold text-foreground">{title}</h4>
            {badge}
          </div>
          {caption ? (
            <p className="text-xs leading-snug text-muted">{caption}</p>
          ) : null}
        </div>
        {body ? <InfoTip label={label}>{body}</InfoTip> : null}
      </div>
      {children}
    </div>
  );
}
