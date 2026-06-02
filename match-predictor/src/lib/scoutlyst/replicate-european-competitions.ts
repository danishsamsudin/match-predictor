import { FOOTBALL_LEAGUES } from "@/lib/data/football-reference";
import { tryCreateServiceClient } from "@/lib/supabase";
import { UpstreamApiError } from "@/lib/types/prediction";

/** Leagues you imported from Scoutlyst (top European + Eredivisie). */
const SCOUTLYST_DOMESTIC_LEAGUE_IDS = [39, 140, 78, 135, 61, 88];
const UCL_LEAGUE_ID = 2;
const UEL_LEAGUE_ID = 3;

/**
 * Copy domestic snapshots into UCL/UEL.
 * Default: mirror every player from SCOUTLYST_DOMESTIC_LEAGUE_IDS into UCL (id 2) and UEL (id 3)
 * so European competition views have full squad metrics from the same Scoutlyst export.
 */
export async function replicateScoutlystToEuropeanCompetitions(input?: {
  snapshotDate?: string;
  /** When true, only copy teams listed in synced_teams for UCL/UEL. Default false = full domestic mirror. */
  filterToSyncedTeamsOnly?: boolean;
}): Promise<{
  uclCopied: number;
  uelCopied: number;
  uclTeams: number;
  uelTeams: number;
}> {
  const client = tryCreateServiceClient();
  if (!client) throw new UpstreamApiError("Missing SUPABASE_SERVICE_ROLE_KEY");
  const supabase = client;

  let snapshotDate = input?.snapshotDate;
  if (!snapshotDate) {
    const { data: latest } = await supabase
      .from("scoutlyst_player_snapshots")
      .select("snapshot_date")
      .order("snapshot_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    snapshotDate = latest?.snapshot_date ?? new Date().toISOString().slice(0, 10);
  }

  async function teamIdsForCompetition(leagueId: number, mirrorDomestic: number[]): Promise<Set<number>> {
    const { data: synced } = await supabase
      .from("synced_teams")
      .select("team_id")
      .eq("league_id", leagueId);
    const ids = new Set((synced ?? []).map((r) => r.team_id));
    if (ids.size > 0) return ids;

    const { data: domestic } = await supabase
      .from("scoutlyst_player_snapshots")
      .select("reference_team_id")
      .eq("snapshot_date", snapshotDate!)
      .in("reference_league_id", mirrorDomestic)
      .not("reference_team_id", "is", null);

    for (const row of domestic ?? []) {
      if (row.reference_team_id != null) ids.add(row.reference_team_id);
    }
    return ids;
  }

  const filterTeams = input?.filterToSyncedTeamsOnly === true;
  const [uclTeams, uelTeams] = filterTeams
    ? await Promise.all([
        teamIdsForCompetition(UCL_LEAGUE_ID, SCOUTLYST_DOMESTIC_LEAGUE_IDS),
        teamIdsForCompetition(UEL_LEAGUE_ID, SCOUTLYST_DOMESTIC_LEAGUE_IDS),
      ])
    : [null, null];

  type SnapshotRow = {
    scoutlyst_player_key: string;
    snapshot_date: string;
    player_name: string;
    team_name: string | null;
    league_name: string | null;
    reference_league_id: number | null;
    reference_team_id: number | null;
    sofascore_player_id: number | null;
    position: string | null;
    age: number | null;
    rating: number | null;
    stats: Record<string, unknown>;
    import_batch_id: number | null;
    imported_at: string;
  };
  const domesticSnapshots: SnapshotRow[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("scoutlyst_player_snapshots")
      .select("*")
      .eq("snapshot_date", snapshotDate)
      .in("reference_league_id", SCOUTLYST_DOMESTIC_LEAGUE_IDS)
      .range(from, from + pageSize - 1);
    if (error) throw new UpstreamApiError(error.message);
    if (!data?.length) break;
    domesticSnapshots.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }

  const now = new Date().toISOString();

  const mapRow = (row: SnapshotRow, leagueId: number) => {
    const keyParts = row.scoutlyst_player_key.includes(":")
      ? row.scoutlyst_player_key.split(":").slice(1).join(":")
      : row.scoutlyst_player_key;
    const leagueName = FOOTBALL_LEAGUES.find((l) => l.id === leagueId)?.name ?? "European competition";
    return {
      scoutlyst_player_key: `${leagueId}:${keyParts}`,
      snapshot_date: row.snapshot_date,
      player_name: row.player_name,
      team_name: row.team_name,
      league_name: leagueName,
      reference_league_id: leagueId,
      reference_team_id: row.reference_team_id,
      sofascore_player_id: row.sofascore_player_id,
      position: row.position,
      age: row.age,
      rating: row.rating,
      stats: row.stats,
      import_batch_id: row.import_batch_id,
      imported_at: now,
    };
  };

  const uclPayload = (domesticSnapshots ?? [])
    .filter((r) => {
      if (filterTeams && uclTeams) {
        return r.reference_team_id != null && uclTeams.has(r.reference_team_id);
      }
      return true;
    })
    .map((r) => mapRow(r, UCL_LEAGUE_ID));

  const uelPayload = (domesticSnapshots ?? [])
    .filter((r) => {
      if (filterTeams && uelTeams) {
        return r.reference_team_id != null && uelTeams.has(r.reference_team_id);
      }
      return true;
    })
    .map((r) => mapRow(r, UEL_LEAGUE_ID));

  const chunk = 200;
  for (let i = 0; i < uclPayload.length; i += chunk) {
    const { error: upErr } = await supabase
      .from("scoutlyst_player_snapshots")
      .upsert(uclPayload.slice(i, i + chunk), { onConflict: "scoutlyst_player_key,snapshot_date" });
    if (upErr) throw new UpstreamApiError(upErr.message);
  }
  for (let i = 0; i < uelPayload.length; i += chunk) {
    const { error: upErr } = await supabase
      .from("scoutlyst_player_snapshots")
      .upsert(uelPayload.slice(i, i + chunk), { onConflict: "scoutlyst_player_key,snapshot_date" });
    if (upErr) throw new UpstreamApiError(upErr.message);
  }

  return {
    uclCopied: uclPayload.length,
    uelCopied: uelPayload.length,
    uclTeams: filterTeams && uclTeams ? uclTeams.size : SCOUTLYST_DOMESTIC_LEAGUE_IDS.length,
    uelTeams: filterTeams && uelTeams ? uelTeams.size : SCOUTLYST_DOMESTIC_LEAGUE_IDS.length,
  };
}
