import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  detectCollapsedTotoMarkets,
  extractHtmlFromMhtml,
  extractTotoSections,
  mapTotoSectionsToOdds,
  parseUnibetHtmlToValueRows,
} from "./parse-unibet-html";

const MHTML_PATH =
  "/Users/danishsamsudin/Downloads/Wedden op Nottingham Forest vs Chelsea _ Engeland Premier League.mhtml";

function byId(odds: { rowId: string; price: number }[]) {
  return Object.fromEntries(odds.map((o) => [o.rowId, o.price]));
}

describe("Toto expanded MHTML", () => {
  it("fills 1X2, DC, BTTS, O/U, EH, AH, team totals, ranges, and shots", () => {
    const raw = readFileSync(MHTML_PATH, "utf8");
    const html = extractHtmlFromMhtml(raw);
    const sections = extractTotoSections(html);
    expect(sections.some((s) => s.name === "Handicap 3-Way" && s.pairs.length > 0)).toBe(
      true
    );
    expect(sections.some((s) => s.name === "Asian Handicap" && s.pairs.length > 0)).toBe(
      true
    );

    const odds = mapTotoSectionsToOdds(
      sections,
      "Nottingham Forest",
      "Chelsea"
    );
    const id = byId(odds);

    expect(id["1x2-home"]).toBe(2.42);
    expect(id["1x2-draw"]).toBe(3.5);
    expect(id["1x2-away"]).toBe(2.65);
    expect(id["dc-1x"]).toBe(1.39);
    expect(id["dc-12"]).toBe(1.29);
    expect(id["dc-x2"]).toBe(1.45);
    expect(id["btts-yes"]).toBe(1.61);
    expect(id["btts-no"]).toBe(2.18);
    expect(id["ou-over-2.5"]).toBe(1.79);
    expect(id["ou-under-2.5"]).toBe(2);

    // European handicap - only lines Toto listed (no +3 here)
    expect(id["eh--3-h"]).toBe(21);
    expect(id["eh--3-d"]).toBe(9.75);
    expect(id["eh--3-a"]).toBe(1.03);
    expect(id["eh--1-h"]).toBe(4.75);
    expect(id["eh--1-d"]).toBe(4.25);
    expect(id["eh--1-a"]).toBe(1.49);
    expect(id["eh-1-h"]).toBe(1.41);
    expect(id["eh-1-d"]).toBe(4.5);
    expect(id["eh-1-a"]).toBe(5.25);
    expect(id["eh-3-h"]).toBeUndefined();

    // Asian handicap - variable lines including +2.5
    expect(id["ah-home--1.5"]).toBe(4.5);
    expect(id["ah-away--1.5"]).toBe(1.17);
    expect(id["ah-home--0.5"]).toBe(2.4);
    expect(id["ah-away--0.5"]).toBe(1.51);
    expect(id["ah-home-0.5"]).toBe(1.43);
    expect(id["ah-away-0.5"]).toBe(2.6);
    expect(id["ah-home-2.5"]).toBe(1.02);
    expect(id["ah-away-2.5"]).toBe(12);

    // Team totals
    expect(id["tt-home-over-1.5"]).toBe(2.15);
    expect(id["tt-home-under-1.5"]).toBe(1.61);
    expect(id["tt-away-over-0.5"]).toBe(1.26);
    expect(id["tt-away-under-2.5"]).toBe(1.14);

    // Goal ranges
    expect(id["range-match-0-1"]).toBe(3.6);
    expect(id["range-match-2-3"]).toBe(1.89);
    expect(id["range-home-0"]).toBe(3.25);
    expect(id["range-away-1-2"]).toBe(1.48);

    // Shots / SoT (Toto line set may only partially overlap model lines)
    expect(id["shots-over-26.5"]).toBe(1.87);
    expect(id["sot-over-8.5"]).toBe(1.77);
  });

  it("parseUnibetHtmlToValueRows detects TOTO without collapsed warnings when expanded", () => {
    const raw = readFileSync(MHTML_PATH, "utf8");
    const result = parseUnibetHtmlToValueRows(raw, {
      homeLabel: "Nottingham Forest",
      awayLabel: "Chelsea",
    });
    expect(result.bookmakerName).toBe("TOTO");
    expect(result.odds.length).toBeGreaterThanOrEqual(40);
    expect(result.warnings.some((w) => w.includes("Collapsed on Toto"))).toBe(
      false
    );
    expect(detectCollapsedTotoMarkets(extractHtmlFromMhtml(raw))).toEqual([]);
  });
});
