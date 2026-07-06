import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseOptaMatchFromFile } from "@/lib/world-cup/opta-html-parser";
import {
  extractAllOptaStatBarRows,
  extractOptaWidgetMatchStats,
  OPTA_STAT,
} from "@/lib/world-cup/opta-widget-stats";
import { WC_OPTA_HTML_FIXTURES_DIR } from "@/lib/world-cup/wc-opta-results-dir";

const USA_PARAGUAY_FIXTURE = path.join(
  WC_OPTA_HTML_FIXTURES_DIR,
  "United States 4-1 Paraguay Stats_ Balogun Stars as Pochettino's Men Produce Statement Win _ Opta Analyst.html"
);

describe("extractOptaWidgetMatchStats", () => {
  it("extracts 40+ stat labels from a full saved Opta widget", () => {
    expect(fs.existsSync(USA_PARAGUAY_FIXTURE)).toBe(true);

    const parsed = parseOptaMatchFromFile(USA_PARAGUAY_FIXTURE);
    expect(parsed.widgetStats).not.toBeNull();
    expect(parsed.widgetStats!.labelCount).toBeGreaterThanOrEqual(40);
    expect(parsed.widgetStats!.home.foulsConceded).toBeGreaterThan(0);
    expect(parsed.widgetStats!.raw[OPTA_STAT.tackles]?.home).toBeGreaterThan(0);
    expect(parsed.widgetStats!.raw[OPTA_STAT.crosses]?.home).toBeGreaterThan(0);
  });

  it("maps discipline and attack stats for USA vs Paraguay widget", () => {
    const parsed = parseOptaMatchFromFile(USA_PARAGUAY_FIXTURE);
    const ws = parsed.widgetStats!;
    expect(ws.home.foulsConceded).toBe(13);
    expect(ws.away.foulsConceded).toBe(17);
    expect(ws.away.yellowCards).toBe(5);
    expect(ws.home.crosses).toBe(19);
    expect(ws.home.finalThirdEntries).toBeGreaterThan(0);
    expect(ws.home.tackles).toBeGreaterThan(0);
    expect(ws.away.tackles).toBeGreaterThan(0);
  });

  it("extractAllOptaStatBarRows deduplicates repeated section labels", () => {
    const fixture = path.join(WC_OPTA_HTML_FIXTURES_DIR, "mexico-south-africa.html");
    const html = fs.readFileSync(fixture, "utf8");
    const rows = extractAllOptaStatBarRows(html);
    expect(rows.get("Possession")?.home).toBe("60.5%");
    expect(rows.get("Corners won")?.home).toBe("3");
  });

  it("returns null for empty widget HTML", () => {
    expect(extractOptaWidgetMatchStats("")).toBeNull();
  });
});
