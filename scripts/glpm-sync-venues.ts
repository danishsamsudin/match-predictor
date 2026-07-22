#!/usr/bin/env npx tsx
/**
 * Sync stadium coordinates into glpm_venues from SportMonks match payloads,
 * applying researched overrides for missing / incomplete venues.
 *
 * Prefer the SQL path (fast aggregate) via Supabase; falls back to paged reads.
 *
 *   npm run glpm:sync-venues
 *   npm run glpm:sync-venues -- --write-json
 */

import fs from "node:fs";
import path from "node:path";
import { tryCreateServiceClient } from "../src/lib/supabase";
import {
  GLPM_COUNTRY_ID_NAMES,
  GLPM_VENUE_LOCATION_OVERRIDES,
} from "../src/lib/glpm/venue-location-overrides";

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const [key, ...rest] = t.split("=");
    const val = rest.join("=").trim().replace(/^["']|["']$/g, "");
    if (key && !(key in process.env)) process.env[key] = val;
  }
}

async function main() {
  loadEnvLocal();
  const writeJson = process.argv.includes("--write-json");
  const client = tryCreateServiceClient();
  if (!client) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  // Apply researched overrides (upsert by sm_id).
  let overrideCount = 0;
  for (const [smIdRaw, override] of Object.entries(GLPM_VENUE_LOCATION_OVERRIDES)) {
    const smId = Number(smIdRaw);
    const { data: existing } = await client
      .from("glpm_venues")
      .select("sm_id,name,city_name,latitude,longitude,country_id,address,capacity,image_path")
      .eq("sm_id", smId)
      .maybeSingle();

    const { error } = await client.from("glpm_venues").upsert(
      {
        sm_id: smId,
        name: existing?.name ?? `Venue ${smId}`,
        city_name: override.cityName ?? existing?.city_name ?? null,
        country_id: existing?.country_id ?? null,
        country_name:
          override.countryName ??
          (existing?.country_id != null
            ? GLPM_COUNTRY_ID_NAMES[existing.country_id] ?? null
            : null),
        address: existing?.address ?? null,
        capacity: existing?.capacity ?? null,
        latitude: override.latitude,
        longitude: override.longitude,
        image_path: existing?.image_path ?? null,
        source: override.source,
        source_notes: override.sourceNotes,
        synced_at: new Date().toISOString(),
      },
      { onConflict: "sm_id" }
    );
    if (error) throw error;
    overrideCount += 1;
  }

  // Patch SportMonks payloads for Groningen rename (null lat/lng in provider).
  const groningen = GLPM_VENUE_LOCATION_OVERRIDES[338881]!;
  const { data: patchMatches, error: patchErr } = await client
    .from("glpm_matches")
    .select("sm_id,payload")
    .eq("venue_sm_id", 338881);
  if (patchErr) throw patchErr;

  let patched = 0;
  for (const m of patchMatches ?? []) {
    const root =
      m.payload && typeof m.payload === "object" && !Array.isArray(m.payload)
        ? { ...(m.payload as Record<string, unknown>) }
        : {};
    const venue =
      root.venue && typeof root.venue === "object" && !Array.isArray(root.venue)
        ? { ...(root.venue as Record<string, unknown>) }
        : {};
    const next = {
      ...root,
      venue: {
        ...venue,
        latitude: String(groningen.latitude),
        longitude: String(groningen.longitude),
        city_name: groningen.cityName ?? "Groningen",
      },
    };
    const { error } = await client
      .from("glpm_matches")
      .update({ payload: next })
      .eq("sm_id", m.sm_id);
    if (!error) patched += 1;
  }

  const { data: venues, error: listErr } = await client
    .from("glpm_venues")
    .select(
      "sm_id,name,city_name,country_name,latitude,longitude,source,source_notes"
    )
    .order("name");
  if (listErr) throw listErr;

  if (writeJson) {
    const outDir = path.join(process.cwd(), "data", "glpm");
    fs.mkdirSync(outDir, { recursive: true });
    const outPath = path.join(outDir, "venues.json");
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        (venues ?? []).map((r) => ({
          smId: r.sm_id,
          name: r.name,
          cityName: r.city_name,
          countryName: r.country_name,
          latitude: Number(r.latitude),
          longitude: Number(r.longitude),
          source: r.source,
          sourceNotes: r.source_notes,
        })),
        null,
        2
      )
    );
    console.log(`Wrote ${outPath}`);
  }

  console.log(
    JSON.stringify(
      {
        venueCount: venues?.length ?? 0,
        overridesApplied: overrideCount,
        patchedMatchPayloads: patched,
        missingCity: (venues ?? []).filter((v) => !v.city_name).length,
        sample: (venues ?? []).slice(0, 5),
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
