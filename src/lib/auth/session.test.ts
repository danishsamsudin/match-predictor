import { describe, expect, it } from "vitest";
import { createSessionToken, verifySessionToken } from "./session";

const secret = "test-secret-key-for-hmac-signing";

describe("session", () => {
  it("creates and verifies a valid session token", async () => {
    const token = await createSessionToken("admin", secret);
    const payload = await verifySessionToken(token, secret);

    expect(payload).not.toBeNull();
    expect(payload?.sub).toBe("admin");
    expect(payload?.exp).toBeGreaterThan(Math.floor(Date.now() / 1000));
  });

  it("rejects a tampered token", async () => {
    const token = await createSessionToken("admin", secret);
    const tampered = `${token}x`;
    const payload = await verifySessionToken(tampered, secret);

    expect(payload).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionToken("admin", secret);
    const payload = await verifySessionToken(token, "other-secret");

    expect(payload).toBeNull();
  });

  it("rejects an expired token", async () => {
    const encoded = Buffer.from(
      JSON.stringify({ sub: "admin", exp: Math.floor(Date.now() / 1000) - 60 })
    ).toString("base64url");
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );
    const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(encoded));
    const token = `${encoded}.${Buffer.from(signature).toString("base64url")}`;

    const payload = await verifySessionToken(token, secret);
    expect(payload).toBeNull();
  });
});
