import { describe, expect, it } from "vitest";
import { normalizeText } from "@/lib/soccerdata/normalize";

describe("normalizeText", () => {
  it("folds Scandinavian letters so Jorgen matches Jørgen", () => {
    expect(normalizeText("Jørgen")).toBe(normalizeText("Jorgen"));
    expect(normalizeText("Højbjerg")).toBe(normalizeText("Hojbjerg"));
    expect(normalizeText("Ødegaard")).toBe(normalizeText("Odegaard"));
    expect(normalizeText("Møller")).toBe(normalizeText("Moller"));
  });
});
