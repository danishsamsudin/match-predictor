import { describe, expect, it } from "vitest";
import { normalizePlayerPosition, primaryPositionToken } from "./normalize-player-position";

describe("normalizePlayerPosition", () => {
  it("maps FBref DF to defender", () => {
    expect(normalizePlayerPosition("DF")).toBe("D");
    expect(normalizePlayerPosition("df")).toBe("D");
  });

  it("maps FBref MF and FW", () => {
    expect(normalizePlayerPosition("MF")).toBe("M");
    expect(normalizePlayerPosition("FW")).toBe("F");
  });

  it("uses primary token for multi-position strings", () => {
    expect(primaryPositionToken("FW,MF")).toBe("FW");
    expect(normalizePlayerPosition("FW,MF")).toBe("F");
    expect(normalizePlayerPosition("DF,MF")).toBe("D");
  });
});
