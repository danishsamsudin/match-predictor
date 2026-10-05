import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  auditNlPlayerStatsDir,
  detectNlPlayerStatsPageKind,
  formatNlPlayerStatsAuditReport,
  parseNlPlayerStatsFixtureFromFilename,
} from "./nl-player-stats-dir";

describe("parseNlPlayerStatsFixtureFromFilename", () => {
  it("parses Opta Betting Showcase names that use Sept", () => {
    const meta = parseNlPlayerStatsFixtureFromFilename(
      "Netherlands vs Germany - 24 Sept 2026 - UEFA Nations League 2026_2027 - Betting Showcase.html"
    );
    expect(meta).not.toBeNull();
    expect(meta!.homeName).toBe("Netherlands");
    expect(meta!.awayName).toBe("Germany");
    expect(meta!.matchDate).toBe("2026-09-24");
  });

  it("parses Sep and September month forms", () => {
    expect(
      parseNlPlayerStatsFixtureFromFilename(
        "Andorra vs Malta - 24 Sep 2026 - UEFA Nations League.html"
      )?.matchDate
    ).toBe("2026-09-24");
    expect(
      parseNlPlayerStatsFixtureFromFilename(
        "Andorra vs Malta - 24 September 2026 - UEFA Nations League.html"
      )?.matchDate
    ).toBe("2026-09-24");
  });
});

describe("detectNlPlayerStatsPageKind", () => {
  it("detects Match Summary from MP container", () => {
    expect(
      detectNlPlayerStatsPageKind(
        '<div class="Opta Opta_F_MP_container Opta-Wide"></div>'
      )
    ).toBe("matchSummary");
  });

  it("detects Opta Summary from OPT container / points", () => {
    expect(
      detectNlPlayerStatsPageKind(
        '<div class="Opta Opta_F_OPT_container Opta-Wide"></div><td class="Opta-Stat-points">8</td>'
      )
    ).toBe("optaSummary");
  });

  it("detects Match Details from playerstats-match / expectedGoals", () => {
    expect(
      detectNlPlayerStatsPageKind(
        '<playerstats-match match="abc"><td class="Opta-Stat-expectedGoals">0.1</td></playerstats-match>'
      )
    ).toBe("matchDetails");
  });
});

describe("auditNlPlayerStatsDir", () => {
  function writeHtml(filePath: string, body: string) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `<html><body>${body}</body></html>`, "utf8");
    const filesDir = filePath.replace(/\.html$/i, "_files");
    fs.mkdirSync(filesDir, { recursive: true });
  }

  const fixtureName =
    "Spain vs Croatia - 29 Sept 2026 - UEFA Nations League 2026_2027 - Betting Showcase.html";

  it("flags incomplete fixtures, duplicates, and wrong-folder files", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nl-player-stats-audit-"));
    try {
      writeHtml(
        path.join(root, "Match Summary", fixtureName),
        '<div class="Opta Opta_F_MP_container"></div>'
      );
      // Missing Opta Summary on purpose.
      writeHtml(
        path.join(root, "Match Details", fixtureName),
        '<playerstats-match match="x"></playerstats-match>'
      );

      // Duplicate Match Summary for same fixture.
      writeHtml(
        path.join(
          root,
          "Match Summary",
          "Spain vs Croatia - 29 Sept 2026 - UEFA Nations League - copy.html"
        ),
        '<div class="Opta Opta_F_MP_container"></div>'
      );

      // Opta Summary page saved into Match Details folder (wrong fixture so it is only a misplacement).
      writeHtml(
        path.join(
          root,
          "Match Details",
          "Andorra vs Malta - 24 Sept 2026 - UEFA Nations League 2026_2027 - Betting Showcase.html"
        ),
        '<div class="Opta Opta_F_OPT_container"></div><td class="Opta-Stat-points">7</td>'
      );

      const audit = auditNlPlayerStatsDir(root);
      expect(audit.ok).toBe(false);
      expect(audit.incomplete.some((i) => i.homeName === "Spain")).toBe(true);
      expect(audit.duplicates.some((d) => d.kind === "matchSummary")).toBe(true);
      expect(
        audit.misplaced.some(
          (m) =>
            m.folderKind === "matchDetails" && m.detectedKind === "optaSummary"
        )
      ).toBe(true);

      const report = formatNlPlayerStatsAuditReport(audit, root).join("\n");
      expect(report).toContain("MISSING pages");
      expect(report).toContain("DUPLICATES");
      expect(report).toContain("WRONG FOLDER");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it("passes when all three pages are present and correctly typed", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "nl-player-stats-ok-"));
    try {
      writeHtml(
        path.join(root, "Match Summary", fixtureName),
        '<div class="Opta Opta_F_MP_container"></div>'
      );
      writeHtml(
        path.join(root, "Opta Summary", fixtureName),
        '<div class="Opta Opta_F_OPT_container"></div><td class="Opta-Stat-points">8</td>'
      );
      writeHtml(
        path.join(root, "Match Details", fixtureName),
        '<playerstats-match match="x"></playerstats-match>'
      );

      const audit = auditNlPlayerStatsDir(root);
      expect(audit.ok).toBe(true);
      expect(audit.completeCount).toBe(1);
      expect(formatNlPlayerStatsAuditReport(audit, root).join("\n")).toContain(
        "Player-stats audit OK"
      );
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
