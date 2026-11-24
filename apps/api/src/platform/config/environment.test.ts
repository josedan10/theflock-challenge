import { describe, expect, it } from "vitest";

import { parseEnvironment } from "./environment.js";

const base = {
  CORS_ORIGIN: "http://localhost:3000",
  DATABASE_URL: "postgresql://user:password@localhost:5433/app",
  SESSION_SECRET: "test-secret-with-at-least-32-characters",
};

describe("environment validation", () => {
  it("FND-01 AC-1 applies safe local defaults", () => {
    expect(parseEnvironment(base)).toMatchObject({
      API_HOST: "0.0.0.0",
      API_PORT: 4000,
      NODE_ENV: "development",
    });
  });

  it("FND-01 AC-2 rejects an invalid CORS origin", () => {
    expect(() => parseEnvironment({ ...base, CORS_ORIGIN: "*" })).toThrow();
  });

  it("US-A02 AC-A02.1 defaults to secure cookies and a 7-day session", () => {
    const environment = parseEnvironment(base);

    expect(environment.COOKIE_DOMAIN).toBeUndefined();
    expect(environment.COOKIE_SECURE).toBe(true);
    expect(environment.SESSION_TTL_SECONDS).toBe(604_800);
  });

  it("US-A02 AC-A02.1 parses cookie flags strictly and treats a blank domain as unset", () => {
    expect(
      parseEnvironment({
        ...base,
        COOKIE_DOMAIN: "  ",
        COOKIE_SECURE: "false",
      }),
    ).toMatchObject({ COOKIE_DOMAIN: undefined, COOKIE_SECURE: false });
    expect(
      parseEnvironment({ ...base, COOKIE_DOMAIN: "example.com" }).COOKIE_DOMAIN,
    ).toBe("example.com");
    expect(() => parseEnvironment({ ...base, COOKIE_SECURE: "yes" })).toThrow();
  });

  it("US-A02 AC-A02.1 refuses insecure cookies in production", () => {
    expect(() =>
      parseEnvironment({
        ...base,
        COOKIE_SECURE: "false",
        NODE_ENV: "production",
      }),
    ).toThrow();
  });

  it("US-A02 AC-A02.4 bounds the session lifetime", () => {
    expect(() =>
      parseEnvironment({ ...base, SESSION_TTL_SECONDS: "60" }),
    ).toThrow();
    expect(() =>
      parseEnvironment({ ...base, SESSION_TTL_SECONDS: String(31 * 86_400) }),
    ).toThrow();
  });

  it("US-A01 AC-A01.5 trusts no proxy by default", () => {
    expect(parseEnvironment(base).TRUST_PROXY).toBeUndefined();
    expect(
      parseEnvironment({ ...base, TRUST_PROXY: " " }).TRUST_PROXY,
    ).toBeUndefined();
  });

  it("US-A01 AC-A01.5 accepts proxy addresses, CIDRs, and named ranges", () => {
    expect(
      parseEnvironment({
        ...base,
        TRUST_PROXY: "loopback, 10.0.0.0/8, 172.18.0.2",
      }).TRUST_PROXY,
    ).toEqual(["loopback", "10.0.0.0/8", "172.18.0.2"]);
  });

  it.each(["true", "false", "1"])(
    "US-A01 AC-A01.5 refuses TRUST_PROXY=%s, which would allow spoofing or be ignored",
    (value) => {
      expect(() => parseEnvironment({ ...base, TRUST_PROXY: value })).toThrow();
    },
  );

  it("US-A02 AC-A02.5 requires a non-placeholder session secret of 32+ characters", () => {
    const { SESSION_SECRET: _omitted, ...withoutSecret } = base;

    expect(() => parseEnvironment(withoutSecret)).toThrow();
    expect(() =>
      parseEnvironment({ ...base, SESSION_SECRET: "short" }),
    ).toThrow();
    expect(() =>
      parseEnvironment({
        ...base,
        SESSION_SECRET: "replace_me_with_at_least_32_characters",
      }),
    ).toThrow();
  });

  it("US-A01 AC-A01.5 defaults the auth rate limit to 5 per minute", () => {
    expect(parseEnvironment(base).AUTH_RATE_LIMIT_PER_MINUTE).toBe(5);
    expect(
      parseEnvironment({ ...base, AUTH_RATE_LIMIT_PER_MINUTE: "500" })
        .AUTH_RATE_LIMIT_PER_MINUTE,
    ).toBe(500);
    expect(() =>
      parseEnvironment({ ...base, AUTH_RATE_LIMIT_PER_MINUTE: "0" }),
    ).toThrow();
  });

  it("TWT-02 defaults the tweet write limit to 20 per minute", () => {
    expect(parseEnvironment(base).TWEET_RATE_LIMIT_PER_MINUTE).toBe(20);
    expect(
      parseEnvironment({ ...base, TWEET_RATE_LIMIT_PER_MINUTE: "1000" })
        .TWEET_RATE_LIMIT_PER_MINUTE,
    ).toBe(1000);
  });

  it("TWT-02 refuses an invalid tweet write limit", () => {
    expect(() =>
      parseEnvironment({ ...base, TWEET_RATE_LIMIT_PER_MINUTE: "0" }),
    ).toThrow();
  });
});
