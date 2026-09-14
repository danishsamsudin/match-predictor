/**
 * Mirror of SQL glpm_livescores_in_poll_window for Europe/Berlin.
 */

export function glpmLivescoresInPollWindow(date = new Date()): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const weekday = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  const dowMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  const dow = dowMap[weekday] ?? -1;

  const inAfternoonEvening =
    (hour > 12 && hour < 23) ||
    (hour === 12 && minute >= 0) ||
    (hour === 23 && minute <= 30);

  const inWeeknight =
    (hour > 18 && hour < 23) ||
    (hour === 18 && minute >= 0) ||
    (hour === 23 && minute <= 30);

  if (dow === 0 || dow === 5 || dow === 6) return inAfternoonEvening;
  if (dow >= 1 && dow <= 4) return inWeeknight;
  return false;
}
