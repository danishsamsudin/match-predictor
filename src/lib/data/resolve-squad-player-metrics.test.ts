import { describe, expect, it } from "vitest";
import {
  playerNameLookupKeys,
  playerNameQueryVariants,
  playerNamesLikelyMatch,
  stripNameTruncation,
  surnamesShareTruncationStem,
} from "@/lib/data/resolve-squad-player-metrics";

describe("playerNameLookupKeys", () => {
  it("includes full name, first-last, and surname keys", () => {
    const keys = playerNameLookupKeys("Virgil van Dijk");
    expect(keys).toContain("virgil van dijk");
    expect(keys).toContain("virgil dijk");
    expect(keys).toContain("dijk");
  });

  it("strips Scoutlyst truncation markers before keying", () => {
    const keys = playerNameLookupKeys("Khvicha Kvaratskheli...");
    expect(keys.some((k) => k.includes("kvaratskheli"))).toBe(true);
    expect(keys.every((k) => !k.includes("..."))).toBe(true);
  });
});

describe("truncation-aware Scoutlyst matching", () => {
  it("stripNameTruncation removes ellipsis", () => {
    expect(stripNameTruncation("Khvicha Kvaratskheli...")).toBe("Khvicha Kvaratskheli");
    expect(stripNameTruncation("Ricky van Wolfswinke…")).toBe("Ricky van Wolfswinke");
  });

  it("matches truncated Scoutlyst export to full display name", () => {
    expect(
      playerNamesLikelyMatch("Khvicha Kvaratskhelia", "Khvicha Kvaratskheli...")
    ).toBe(true);
    expect(
      surnamesShareTruncationStem("Kvaratskhelia", "Kvaratskheli...")
    ).toBe(true);
  });

  it("does not match unrelated surnames", () => {
    expect(playerNamesLikelyMatch("Harry Kane", "Harry Maguire")).toBe(false);
  });
});

describe("playerNameQueryVariants", () => {
  it("keeps display name and first/last reorder variants for DB lookups", () => {
    expect(playerNameQueryVariants("Kylian Mbappé")).toEqual([
      "Kylian Mbappé",
      "Mbappé Kylian",
    ]);

    const variants = playerNameQueryVariants("Virgil van Dijk");
    expect(variants).toContain("Virgil van Dijk");
    expect(variants).toContain("Virgil Dijk");
    expect(variants).toContain("Dijk Virgil");
  });

  it("ignores blank names", () => {
    expect(playerNameQueryVariants("   ")).toEqual([]);
  });
});
