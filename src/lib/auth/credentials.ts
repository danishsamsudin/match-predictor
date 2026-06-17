import { timingSafeEqual } from "crypto";
import { getAuthConfig } from "./config";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function verifyCredentials(username: string, password: string): boolean {
  const config = getAuthConfig();
  if (!config) {
    return false;
  }

  return safeEqual(username, config.username) && safeEqual(password, config.password);
}
