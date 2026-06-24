/** Count fractional digits in a finite number (trailing zeros preserved in string form). */
function countFractionalDigits(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const text = String(value);
  const dot = text.indexOf(".");
  return dot < 0 ? 0 : text.length - dot - 1;
}

/** Decimal places to show so home/away use the same precision (e.g. 0.684 vs 0.680). */
export function pairedStatDecimalPlaces(home: number, away: number, cap = 4): number {
  return Math.min(cap, Math.max(countFractionalDigits(home), countFractionalDigits(away)));
}

export function formatPairedStatValue(value: number, decimalPlaces: number): string {
  if (decimalPlaces <= 0) return String(Math.round(value));
  return value.toFixed(decimalPlaces);
}
