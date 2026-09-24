import { describe, expect, it } from "vitest";
import {
  playerNameLookupKeys,
  playerNameQueryVariants,
} from "@/lib/data/resolve-squad-player-metrics";

describe("playerNameLookupKeys", () => {
  it("includes full name, first-last, and surname keys", () => {
    const keys = playerNameLookupKeys("Virgil van Dijk");
    expect(keys).toContain("virgil van dijk");
    expect(keys).toContain("virgil dijk");
    expect(keys).toContain("dijk");
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
