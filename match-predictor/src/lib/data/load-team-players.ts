import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase";
import type { TopScorer } from "@/lib/types/football";
import type { TeamPlayerStat } from "@/lib/types/team-comparison";

type ServiceClient = SupabaseClient<Database>;

function topScorersForTeam(topScorers: TopScorer[], teamId: number, limit: number): TeamPlayerStat[] {
  return topScorers
    .filter((s) => s.statistics.some((st) => st.team.id === teamId))
    .sort((a, b) => (b.statistics[0]?.goals.total ?? 0) - (a.statistics[0]?.goals.total ?? 0))
    .slice(0, limit)
    .map((s) => {
      const stat = s.statistics.find((st) => st.team.id === teamId) ?? s.statistics[0];
      const goals = stat?.goals.total;
      const apps = stat?.games.appearences;
      return {
        name: s.player.name,
        goals: goals != null ? String(goals) : null,
        appearances: apps != null ? String(apps) : null,
        rating: null,
        position: null,
      };
    });
}

export async function loadTeamPlayersForComparison(
  supabase: ServiceClient | null,
  teamId: number,
  topScorers: TopScorer[],
  limit = 5
): Promise<TeamPlayerStat[]> {
  const fromScorers = topScorersForTeam(topScorers, teamId, limit);
  const seen = new Set(fromScorers.map((p) => p.name.toLowerCase()));
  const merged = [...fromScorers];

  if (supabase && merged.length < limit) {
    const { data } = await supabase
      .from("soccerdata_players")
      .select("name, position, sofifa_overall")
      .eq("team_id", teamId)
      .order("sofifa_overall", { ascending: false, nullsFirst: false })
      .limit(limit * 2);

    for (const row of data ?? []) {
      if (merged.length >= limit) break;
      const key = row.name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({
        name: row.name,
        goals: null,
        appearances: null,
        rating: row.sofifa_overall != null ? row.sofifa_overall.toFixed(1) : null,
        position: row.position,
      });
    }
  }

  return merged.slice(0, limit);
}
