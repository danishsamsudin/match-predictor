"use client";

import type { ReactNode } from "react";
import { InfoTip } from "@/components/ui/InfoTip";
import {
  GLPM_CX_GLOSSARY,
  type GlossaryEntry,
  type GlossaryKey,
  glossaryTipBody,
} from "@/lib/glpm-cx/glossary";
import { SectionTip } from "@/components/glpm/insights/primitives";

function GlossaryTipContent({ entry }: { entry: GlossaryEntry }) {
  return (
    <div className="max-w-xs space-y-2.5 text-xs leading-relaxed">
      <p className="text-foreground/95">{entry.what}</p>
      <p>
        <span className="font-semibold text-foreground">How it works</span>
        <span className="text-muted"> - {entry.how}</span>
      </p>
      {entry.caveat ? (
        <p className="rounded-lg bg-foreground/5 px-2.5 py-2 text-muted">
          {entry.caveat}
        </p>
      ) : null}
    </div>
  );
}

/** Lightweight subsection header inside a chapter glass panel. */
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
  /** @deprecated Prefer glossary tips; ignored for visual density. */
  howToRead?: string;
  glossaryKey?: GlossaryKey;
  tipLabel?: string;
  tipBody?: ReactNode;
  children: ReactNode;
  className?: string;
  badge?: ReactNode;
}) {
  void howToRead;
  return (
    <div className={`min-w-0 ${className}`}>
      <SectionTip
        title={title}
        glossaryKey={glossaryKey}
        tipLabel={tipLabel}
        tipBody={tipBody}
        badge={badge}
        className="mb-3"
      />
      {children}
    </div>
  );
}

/** One glass surface per chapter; children form an internal grid. */
export function InsightChapter({
  title,
  children,
  glossaryKey,
  tipLabel,
  tipBody,
  className = "",
}: {
  title: string;
  children: ReactNode;
  glossaryKey?: GlossaryKey;
  tipLabel?: string;
  tipBody?: ReactNode;
  className?: string;
}) {
  const entry = glossaryKey ? GLPM_CX_GLOSSARY[glossaryKey] : null;
  const label = tipLabel ?? entry?.label ?? title;
  const body =
    tipBody ??
    (entry ? <GlossaryTipContent entry={entry} /> : null) ??
    (glossaryKey ? glossaryTipBody(glossaryKey) : null);

  return (
    <section
      className={`liquid-glass-panel min-w-0 max-w-full overflow-x-auto overflow-y-visible rounded-2xl p-4 sm:p-5 ${className}`}
    >
      <div className="mb-4 flex items-center gap-3">
        <h2 className="type-meta shrink-0 font-bold uppercase tracking-[0.16em] text-muted">
          {title}
        </h2>
        <div className="h-px flex-1 bg-glass-border/80" aria-hidden />
        {body ? (
          <InfoTip label={label} size="sm">
            {body}
          </InfoTip>
        ) : null}
      </div>
      <div className="grid min-w-0 items-start gap-6 lg:grid-cols-2">
        {children}
      </div>
    </section>
  );
}
