import { resolveFbrefTeamIdByName } from "@/lib/fbref/comparison-fallback";
import type { SportApiEvent } from "@/lib/types/sportapi";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

function managerNameForTeam(
  match: {
    home_team_id: string | null;
    away_team_id: string | null;
    home_manager_id: number | null;
    away_manager_id: number | null;
  },
  teamId: string,
  managerNames: Map<number, string>
): string | null {
  const side =
    match.home_team_id === teamId
      ? match.home_manager_id
      : match.away_team_id === teamId
        ? match.away_manager_id
        : null;
  if (side == null) return null;
  return managerNames.get(side) ?? null;
}

/** Drop synced events older than the most recent managerial regime (FBref match logs). */
export async function filterEventsByCoachContinuity(
  supabase: ServiceClient,
  events: SportApiEvent[],
  teamName?: string
): Promise<SportApiEvent[]> {
  if (!events.length || !teamName?.trim()) return events;

  const fbrefTeam = await resolveFbrefTeamIdByName(teamName);
  if (!fbrefTeam) return events;

  const { data: matchRows, error } = await supabase
    .from("matches")
    .select(
      "id, date, home_team_id, away_team_id, home_manager_id, away_manager_id"
    )
    .or(`home_team_id.eq.${fbrefTeam.id},away_team_id.eq.${fbrefTeam.id}`)
    .not("home_goals", "is", null)
    .order("date", { ascending: false })
    .limit(20);

  if (error || !matchRows?.length) return events;

  const managerIds = new Set<number>();
  for (const row of matchRows) {
    if (row.home_manager_id != null) managerIds.add(row.home_manager_id);
    if (row.away_manager_id != null) managerIds.add(row.away_manager_id);
  }

  const managerNames = new Map<number, string>();
  if (managerIds.size) {
    const { data: managers } = await supabase
      .from("managers")
      .select("id, name")
      .in("id", [...managerIds]);
    for (const m of managers ?? []) {
      managerNames.set(m.id, m.name);
    }
  }

  let currentCoach: string | null = null;
  let cutoffMs: number | null = null;

  for (const match of matchRows) {
    const coach = managerNameForTeam(match, fbrefTeam.id, managerNames);
    if (!coach) continue;
    if (!currentCoach) {
      currentCoach = coach;
      continue;
    }
    if (coach !== currentCoach) {
      if (match.date) cutoffMs = new Date(match.date).getTime();
      break;
    }
  }

  if (cutoffMs == null || !Number.isFinite(cutoffMs)) return events;

  return events.filter((event) => {
    const ts = event.startTimestamp ?? 0;
    if (ts > 0) return ts * 1000 >= cutoffMs!;
    if (event.startTime) {
      const parsed = Date.parse(event.startTime);
      return Number.isFinite(parsed) ? parsed >= cutoffMs! : true;
    }
    return true;
  });
}
