import { afterEach, describe, expect, it } from "vitest";
import { verifyCredentials } from "./credentials";

const originalEnv = { ...process.env };

afterEach(() => {
  process.env = { ...originalEnv };
});

describe("verifyCredentials", () => {
  it("returns true for matching credentials", () => {
    process.env.AUTH_USERNAME = "admin";
    process.env.AUTH_PASSWORD = "secret-pass";
    process.env.AUTH_SECRET = "test-secret";

    expect(verifyCredentials("admin", "secret-pass")).toBe(true);
  });

  it("returns false for wrong password", () => {
    process.env.AUTH_USERNAME = "admin";
    process.env.AUTH_PASSWORD = "secret-pass";
    process.env.AUTH_SECRET = "test-secret";

    expect(verifyCredentials("admin", "wrong-pass")).toBe(false);
  });

  it("returns false for wrong username", () => {
    process.env.AUTH_USERNAME = "admin";
    process.env.AUTH_PASSWORD = "secret-pass";
    process.env.AUTH_SECRET = "test-secret";

    expect(verifyCredentials("other", "secret-pass")).toBe(false);
  });

  it("returns false when auth env vars are missing", () => {
    delete process.env.AUTH_USERNAME;
    delete process.env.AUTH_PASSWORD;
    delete process.env.AUTH_SECRET;

    expect(verifyCredentials("admin", "secret-pass")).toBe(false);
  });
});
