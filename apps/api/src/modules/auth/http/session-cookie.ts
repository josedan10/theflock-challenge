import type { CookieSerializeOptions } from "@fastify/cookie";

/** Name of the HTTP-only cookie carrying the opaque session token. */
export const SESSION_COOKIE_NAME = "sid";

export interface SessionCookieSettings {
  secure: boolean;
  domain: string | undefined;
  ttlSeconds: number;
}

/**
 * HTTP-only so scripts cannot read the token, `SameSite=Lax` as a first CSRF
 * layer, and host-wide path. `Secure` is enforced in production by config.
 */
export function sessionCookieOptions(
  settings: SessionCookieSettings,
): CookieSerializeOptions {
  return {
    httpOnly: true,
    maxAge: settings.ttlSeconds,
    path: "/",
    sameSite: "lax",
    secure: settings.secure,
    ...(settings.domain === undefined ? {} : { domain: settings.domain }),
  };
}
