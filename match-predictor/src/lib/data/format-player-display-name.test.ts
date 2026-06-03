import { describe, expect, it } from "vitest";
import { formatPlayerDisplayName } from "./format-player-display-name";

describe("formatPlayerDisplayName", () => {
  it("leaves normal names unchanged", () => {
    expect(formatPlayerDisplayName("Virgil van Dijk")).toBe("Virgil van Dijk");
    expect(formatPlayerDisplayName("Erling Haaland")).toBe("Erling Haaland");
  });

  it("fixes FIFA PDF glued names", () => {
    expect(
      formatPlayerDisplayName("VERBRUGGEN Bart Bart VERBRUGGENVERBRUGGEN")
    ).toBe("Bart Verbruggen");
    expect(formatPlayerDisplayName("VAN DIJK Virgil Virgil VAN DIJK VIRGIL")).toBe(
      "Virgil van Dijk"
    );
    expect(formatPlayerDisplayName("WAN-BISSAKA Aaron Aaron Wan WAN-BISSAKA")).toBe(
      "Aaron Wan-Bissaka"
    );
  });
});
