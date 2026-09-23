import { describe, expect, it } from "vitest";
import {
  collapseRepeatedNameTokens,
  formatPlayerDisplayName,
} from "./format-player-display-name";

describe("formatPlayerDisplayName", () => {
  it("leaves normal names unchanged", () => {
    expect(formatPlayerDisplayName("Virgil van Dijk")).toBe("Virgil van Dijk");
    expect(formatPlayerDisplayName("Erling Haaland")).toBe("Erling Haaland");
    expect(formatPlayerDisplayName("Thelo Thelonious Gerard Aasgaard")).toBe(
      "Thelo Thelonious Gerard Aasgaard"
    );
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

  it("collapses doubled Scandinavian given names", () => {
    expect(formatPlayerDisplayName("Jorgen Jørgen Strand Larsen")).toBe(
      "Jørgen Strand Larsen"
    );
    expect(formatPlayerDisplayName("Fredrik Andre Fredrik André Bjorkan")).toBe(
      "Fredrik André Bjorkan"
    );
    expect(formatPlayerDisplayName("Jens Petter Jens Petter Hauge")).toBe(
      "Jens Petter Hauge"
    );
    expect(formatPlayerDisplayName("David Møller Moller Wolfe")).toBe(
      "David Møller Wolfe"
    );
  });
});

describe("collapseRepeatedNameTokens", () => {
  it("collapses ABAB and ABCABC blocks", () => {
    expect(collapseRepeatedNameTokens("el Hadji Malick el Hadji Malick Diouf")).toBe(
      "el Hadji Malick Diouf"
    );
    expect(collapseRepeatedNameTokens("Jose Maria José María Giménez")).toBe(
      "José María Giménez"
    );
  });
});
