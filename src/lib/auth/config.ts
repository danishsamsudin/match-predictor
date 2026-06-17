export const SESSION_COOKIE_NAME = "mp_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;

export type AuthConfig = {
  username: string;
  password: string;
  secret: string;
};

export function getAuthConfig(): AuthConfig | null {
  const username = process.env.AUTH_USERNAME?.trim();
  const password = process.env.AUTH_PASSWORD;
  const secret = process.env.AUTH_SECRET?.trim();

  if (!username || !password || !secret) {
    return null;
  }

  return { username, password, secret };
}

export function requireAuthConfig(): AuthConfig {
  const config = getAuthConfig();
  if (!config) {
    throw new Error(
      "Missing auth configuration. Set AUTH_USERNAME, AUTH_PASSWORD, and AUTH_SECRET."
    );
  }
  return config;
}
