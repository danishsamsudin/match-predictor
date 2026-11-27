/**
 * Stylized product preview for marketing surfaces.
 * Decorative only - not live data.
 */
export function ProductPreview() {
  return (
    <div
      className="glass-surface relative mx-auto max-w-4xl overflow-hidden rounded-[1.75rem] p-4 sm:p-6"
      aria-hidden="true"
    >
      <div className="absolute inset-0 marketing-hero-glow opacity-40" />
      <div className="relative space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-glass-border pb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Match card
            </p>
            <p className="mt-1 text-sm font-bold text-foreground">Premier League · GW sample</p>
          </div>
          <span className="rounded-full border border-glass-border bg-surface px-3 py-1 text-[11px] font-semibold text-foreground">
            Research only
          </span>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { label: "Home", value: "42%" },
            { label: "Draw", value: "27%" },
            { label: "Away", value: "31%" },
          ].map((cell) => (
            <div key={cell.label} className="rounded-2xl border border-glass-border bg-surface/70 px-4 py-3 text-center">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
                {cell.label}
              </p>
              <p className="mt-1 text-2xl font-bold tracking-tight text-foreground">{cell.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl border border-glass-border bg-surface/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Fair odds · 1X2
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              Home 2.38 - Draw 3.70 - Away 3.23
            </p>
          </div>
          <div className="rounded-2xl border border-glass-border bg-surface/70 px-4 py-3">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-muted">
              Value Opportunities
            </p>
            <p className="mt-2 text-sm font-semibold text-foreground">
              Confidence · Kelly stake · Bet / Watch / Pass
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
