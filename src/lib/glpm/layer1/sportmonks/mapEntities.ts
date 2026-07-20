import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../../supabase";
import type { SmCoach, SmParticipant, SmPlayer, SmTeam } from "../../../sportmonks/types";
import { upsertProviderPayload } from "../upsertPayload";

type Client = SupabaseClient<Database>;
type TeamInsert = Database["public"]["Tables"]["glpm_teams"]["Insert"];
type PlayerInsert = Database["public"]["Tables"]["glpm_players"]["Insert"];
type CoachInsert = Database["public"]["Tables"]["glpm_coaches"]["Insert"];

function parseDateOnly(value: string | undefined | null): string | null {
  if (!value) return null;
  const d = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

function activeTeamIdFromLinks(
  links: Array<{ team_id?: number; end?: string | null; active?: boolean }> | undefined
): number | null {
  if (!links?.length) return null;
  const now = Date.now();
  const active = links.find((l) => l.active === true);
  if (active?.team_id != null) return active.team_id;
  for (const link of links) {
    if (link.team_id == null) continue;
    if (!link.end) return link.team_id;
    const endMs = Date.parse(link.end);
    if (Number.isFinite(endMs) && endMs >= now) return link.team_id;
  }
  return links[links.length - 1]?.team_id ?? null;
}

/** Map a SportMonks team or fixture participant to `glpm_teams`. */
export function mapSportmonksTeam(team: SmTeam | SmParticipant): TeamInsert {
  const full = team as SmTeam;
  const activeCoach =
    full.coaches?.find((c) =>
      (c.teams ?? []).some((t) => t.active === true || !t.end)
    ) ?? full.coaches?.[0];

  return {
    sm_id: team.id,
    name: team.name ?? full.common_name ?? `Team ${team.id}`,
    official_name: full.common_name ?? team.name ?? null,
    city: full.venue?.city_name ?? null,
    area_name: full.country?.name ?? null,
    stadium_name: full.venue?.name ?? null,
    stadium_capacity: full.venue?.capacity ?? null,
    altitude: null,
    promotion_status: null,
    manager_sm_id: activeCoach?.id ?? null,
    manager_name:
      (activeCoach?.display_name ??
        activeCoach?.name ??
        [activeCoach?.firstname, activeCoach?.lastname].filter(Boolean).join(" ")) ||
      null,
    payload: team as unknown,
    synced_at: new Date().toISOString(),
  };
}

export function mapSportmonksPlayer(player: SmPlayer): PlayerInsert {
  const currentTeamSmId = activeTeamIdFromLinks(player.teams);
  const position = player.detailedPosition ?? player.position;

  return {
    sm_id: player.id,
    current_team_sm_id: currentTeamSmId,
    short_name: player.display_name ?? player.common_name ?? player.name ?? null,
    first_name: player.firstname ?? null,
    last_name: player.lastname ?? null,
    birth_date: parseDateOnly(player.date_of_birth),
    height_cm: typeof player.height === "number" ? Math.round(player.height) : null,
    foot: player.foot ?? null,
    role_code: position?.code ?? position?.developer_name ?? null,
    role_name: position?.name ?? null,
    status: player.status ?? null,
    payload: player as unknown,
    synced_at: new Date().toISOString(),
  };
}

export function mapSportmonksCoach(coach: SmCoach): CoachInsert {
  const currentTeamSmId = activeTeamIdFromLinks(coach.teams);
  const nationality =
    (coach as { nationality?: { name?: string } }).nationality?.name ??
    (coach as { country?: { name?: string } }).country?.name ??
    null;

  return {
    sm_id: coach.id,
    name:
      (coach.display_name ??
        coach.name ??
        [coach.firstname, coach.lastname].filter(Boolean).join(" ")) || `Coach ${coach.id}`,
    first_name: coach.firstname ?? null,
    last_name: coach.lastname ?? null,
    nationality,
    birth_date: parseDateOnly(coach.date_of_birth),
    current_team_sm_id: currentTeamSmId,
    payload: coach as unknown,
    synced_at: new Date().toISOString(),
  };
}

export async function upsertSportmonksTeam(
  supabase: Client,
  team: SmTeam | SmParticipant,
  options?: { storeRaw?: boolean }
): Promise<TeamInsert> {
  if (options?.storeRaw !== false) {
    await upsertProviderPayload(supabase, {
      provider: "sportmonks",
      endpoint: `/teams/${team.id}`,
      entityType: "team",
      entityKey: String(team.id),
      payload: team,
    });
  }

  const row = mapSportmonksTeam(team);
  const { error } = await supabase.from("glpm_teams").upsert(row, { onConflict: "sm_id" });
  if (error) throw new Error(`upsert glpm_teams failed: ${error.message}`);
  return row;
}

async function ensureTeamExists(
  supabase: Client,
  teamSmId: number | null | undefined
): Promise<void> {
  if (teamSmId == null) return;
  const { data } = await supabase
    .from("glpm_teams")
    .select("sm_id")
    .eq("sm_id", teamSmId)
    .maybeSingle();
  if (data) return;
  const { error } = await supabase.from("glpm_teams").upsert(
    {
      sm_id: teamSmId,
      name: `Team ${teamSmId}`,
      synced_at: new Date().toISOString(),
    },
    { onConflict: "sm_id" }
  );
  if (error) throw new Error(`ensureTeamExists failed: ${error.message}`);
}

export async function upsertSportmonksPlayer(
  supabase: Client,
  player: SmPlayer,
  options?: { storeRaw?: boolean }
): Promise<PlayerInsert> {
  if (options?.storeRaw !== false) {
    await upsertProviderPayload(supabase, {
      provider: "sportmonks",
      endpoint: `/players/${player.id}`,
      entityType: "player",
      entityKey: String(player.id),
      payload: player,
    });
  }

  const row = mapSportmonksPlayer(player);
  await ensureTeamExists(supabase, row.current_team_sm_id);
  const { error } = await supabase.from("glpm_players").upsert(row, { onConflict: "sm_id" });
  if (error) throw new Error(`upsert glpm_players failed: ${error.message}`);
  return row;
}

export async function upsertSportmonksCoach(
  supabase: Client,
  coach: SmCoach,
  options?: { storeRaw?: boolean }
): Promise<CoachInsert> {
  if (options?.storeRaw !== false) {
    await upsertProviderPayload(supabase, {
      provider: "sportmonks",
      endpoint: `/coaches/${coach.id}`,
      entityType: "coach",
      entityKey: String(coach.id),
      payload: coach,
    });
  }

  const row = mapSportmonksCoach(coach);
  await ensureTeamExists(supabase, row.current_team_sm_id);
  const { error } = await supabase.from("glpm_coaches").upsert(row, { onConflict: "sm_id" });
  if (error) throw new Error(`upsert glpm_coaches failed: ${error.message}`);

  if (row.current_team_sm_id != null) {
    await supabase
      .from("glpm_teams")
      .update({
        manager_sm_id: row.sm_id,
        manager_name: row.name,
        synced_at: new Date().toISOString(),
      })
      .eq("sm_id", row.current_team_sm_id);
  }

  return row;
}

export async function ensureFixturePlayersReferenced(
  supabase: Client,
  fixture: { id: number; events?: Array<{ player_id?: number | null; participant_id?: number | null; player_name?: string }>; lineups?: Array<{ player_id?: number; team_id?: number; player_name?: string }> }
): Promise<number> {
  const refs = new Map<number, { teamSmId: number | null; name: string | null }>();

  for (const event of fixture.events ?? []) {
    if (event.player_id == null) continue;
    refs.set(event.player_id, {
      teamSmId: event.participant_id ?? null,
      name: event.player_name ?? null,
    });
  }

  for (const row of fixture.lineups ?? []) {
    if (row.player_id == null) continue;
    refs.set(row.player_id, {
      teamSmId: row.team_id ?? refs.get(row.player_id)?.teamSmId ?? null,
      name: row.player_name ?? refs.get(row.player_id)?.name ?? null,
    });
  }

  if (!refs.size) return 0;

  const now = new Date().toISOString();
  const rows: PlayerInsert[] = [...refs.entries()].map(([sm_id, meta]) => ({
    sm_id,
    current_team_sm_id: meta.teamSmId,
    short_name: meta.name ?? `Player ${sm_id}`,
    payload: { source: "fixture_reference", match_sm_id: fixture.id },
    synced_at: now,
  }));

  const { error } = await supabase.from("glpm_players").upsert(rows, { onConflict: "sm_id" });
  if (error) throw new Error(`ensureFixturePlayersReferenced failed: ${error.message}`);
  return rows.length;
}

export async function upsertSportmonksTeamsBatch(
  supabase: Client,
  teams: Array<SmTeam | SmParticipant>
): Promise<number> {
  let count = 0;
  for (const team of teams) {
    await upsertSportmonksTeam(supabase, team);
    count += 1;
  }
  return count;
}

export async function upsertSportmonksPlayersBatch(
  supabase: Client,
  players: SmPlayer[]
): Promise<number> {
  let count = 0;
  for (const player of players) {
    await upsertSportmonksPlayer(supabase, player);
    count += 1;
  }
  return count;
}

export async function upsertSportmonksCoachesBatch(
  supabase: Client,
  coaches: SmCoach[]
): Promise<number> {
  let count = 0;
  for (const coach of coaches) {
    await upsertSportmonksCoach(supabase, coach);
    count += 1;
  }
  return count;
}
