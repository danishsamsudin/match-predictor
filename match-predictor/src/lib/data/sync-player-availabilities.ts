import { normalizeText } from "@/lib/soccerdata/normalize";
import { formatPlayerDisplayNameIfNeeded } from "@/lib/data/format-player-display-name";
import type { PlayerAvailabilityStatus } from "@/lib/data/player-availability";
import type { Database } from "@/lib/supabase";
import type { SupabaseClient } from "@supabase/supabase-js";

type ServiceClient = SupabaseClient<Database>;

export type AvailabilityUpsertRow = {
  player_name: string;
  status: PlayerAvailabilityStatus;
  source?: string;
};

const STATUS_VALUES = new Set<PlayerAvailabilityStatus>([
  "injured",
  "suspended",
  "doubtful",
]);

function parseStatus(raw: string): PlayerAvailabilityStatus | null {
  const normalized = raw.trim().toLowerCase();
  if (STATUS_VALUES.has(normalized as PlayerAvailabilityStatus)) {
    return normalized as PlayerAvailabilityStatus;
  }
  if (normalized.includes("injur")) return "injured";
  if (normalized.includes("suspend") || normalized.includes("ban")) return "suspended";
  if (normalized.includes("doubt")) return "doubtful";
  return null;
}

/** Parse simple CSV exports: player_name,status */
export function parseAvailabilityCsv(text: string): AvailabilityUpsertRow[] {
  const rows: AvailabilityUpsertRow[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (i === 0 && line.toLowerCase().includes("player") && line.toLowerCase().includes("status")) {
      continue;
    }
    const [namePart, statusPart] = line.split(",").map((s) => s.trim());
    if (!namePart || !statusPart) continue;
    const status = parseStatus(statusPart);
    if (!status) continue;
    rows.push({
      player_name: formatPlayerDisplayNameIfNeeded(namePart),
      status,
      source: "csv",
    });
  }
  return rows;
}

/** Best-effort HTML table scrape (Transfermarkt-style injury lists). */
export function parseAvailabilityHtml(html: string, source = "html"): AvailabilityUpsertRow[] {
  const rows: AvailabilityUpsertRow[] = [];
  const rowPattern =
    /<tr[^>]*>[\s\S]*?<a[^>]*>([^<]+)<\/a>[\s\S]*?(injur|susp|doubt|out)[^<]*[\s\S]*?<\/tr>/gi;
  let match: RegExpExecArray | null;
  while ((match = rowPattern.exec(html)) !== null) {
    const name = formatPlayerDisplayNameIfNeeded(match[1].trim());
    const status = parseStatus(match[2]);
    if (!name || !status) continue;
    rows.push({ player_name: name, status, source });
  }

  if (rows.length) return rows;

  const anchorPattern = />([A-Z][a-z]+(?:\s+[A-Z][a-z'.-]+)+)</g;
  const statusPattern = /(injur(?:ed|y)?|suspended|doubtful)/gi;
  const names: string[] = [];
  let nameMatch: RegExpExecArray | null;
  while ((nameMatch = anchorPattern.exec(html)) !== null) {
    const candidate = nameMatch[1].trim();
    if (candidate.split(/\s+/).length >= 2) names.push(candidate);
  }
  const statuses = [...html.matchAll(statusPattern)].map((m) => parseStatus(m[0])).filter(Boolean);
  const limit = Math.min(names.length, statuses.length, 80);
  for (let i = 0; i < limit; i++) {
    rows.push({
      player_name: formatPlayerDisplayNameIfNeeded(names[i]),
      status: statuses[i] as PlayerAvailabilityStatus,
      source,
    });
  }
  return rows;
}

export async function upsertPlayerAvailabilities(
  supabase: ServiceClient,
  rows: AvailabilityUpsertRow[]
): Promise<{ upserted: number }> {
  const deduped = new Map<string, AvailabilityUpsertRow>();
  for (const row of rows) {
    const key = normalizeText(row.player_name);
    if (!key) continue;
    deduped.set(key, row);
  }

  const payload = [...deduped.values()].map((row) => ({
    player_name: row.player_name,
    status: row.status,
    source: row.source ?? "manual",
    updated_at: new Date().toISOString(),
  }));

  if (!payload.length) return { upserted: 0 };

  const { error } = await supabase.from("player_availabilities").upsert(payload, {
    onConflict: "player_name",
  });
  if (error) throw error;
  return { upserted: payload.length };
}

export async function runPlayerAvailabilitySync(
  supabase: ServiceClient,
  options?: { csvPath?: string; fetchUrl?: string }
): Promise<{ upserted: number; source: string }> {
  const rows: AvailabilityUpsertRow[] = [];

  if (options?.csvPath) {
    const fs = await import("node:fs/promises");
    const text = await fs.readFile(options.csvPath, "utf8");
    rows.push(...parseAvailabilityCsv(text));
  }

  if (options?.fetchUrl) {
    const res = await fetch(options.fetchUrl, {
      headers: { "User-Agent": "match-predictor-availability-sync/1.0" },
    });
    if (!res.ok) {
      throw new Error(`Availability fetch failed: ${res.status} ${res.statusText}`);
    }
    const html = await res.text();
    rows.push(...parseAvailabilityHtml(html, options.fetchUrl));
  }

  const { upserted } = await upsertPlayerAvailabilities(supabase, rows);
  return {
    upserted,
    source: options?.csvPath ?? options?.fetchUrl ?? "none",
  };
}
