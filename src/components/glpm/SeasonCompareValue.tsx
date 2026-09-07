"use client";

export function SeasonCompareValue({
  current,
  prior,
  priorTitle,
  priorSeasonLabel,
}: {
  current: string;
  prior: string | null;
  priorTitle?: string | null;
  /** Short season tag shown inside the violet brackets, e.g. 26/27. */
  priorSeasonLabel?: string | null;
}) {
  const showPrior = prior != null && prior !== current;
  return (
    <>
      {current}
      {showPrior ? (
        <span className="glpm-prior-season" title={priorTitle ?? undefined}>
          {" "}
          (
          {priorSeasonLabel ? `${priorSeasonLabel} ` : ""}
          {prior})
        </span>
      ) : null}
    </>
  );
}
