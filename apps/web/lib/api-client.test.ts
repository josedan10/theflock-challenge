import { describe, expect, it, vi } from "vitest";

import { ApiError, createApiClient } from "./api-client";

const session = {
  csrfToken: "c".repeat(43),
  user: {
    avatarUrl: null,
    bio: "",
    createdAt: "2026-11-24T12:00:00.000Z",
    displayName: "Ada",
    id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
    username: "ada",
  },
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
    status,
  });
}

function clientReturning(response: Response | Error) {
  const fetchImpl = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) {
      throw response;
    }
    return response;
  });
  return { client: createApiClient("http://api.test", fetchImpl), fetchImpl };
}

const errorBody = (
  code: string,
  message: string,
  fields?: Record<string, string[]>,
) => ({
  error: {
    code,
    message,
    requestId: "req-1",
    ...(fields === undefined ? {} : { fields }),
  },
});

describe("API client", () => {
  it("US-A01 AC-A01.1 registers with credentials included and parses the session", async () => {
    const { client, fetchImpl } = clientReturning(jsonResponse(201, session));
    const input = {
      email: "ada@example.com",
      password: "correct horse battery",
      username: "ada",
    };

    await expect(client.register(input)).resolves.toEqual(session);

    expect(fetchImpl).toHaveBeenCalledWith("http://api.test/v1/auth/register", {
      body: JSON.stringify(input),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
      },
      method: "POST",
    });
  });

  it("US-A02 AC-A02.1 logs in against the login endpoint", async () => {
    const { client, fetchImpl } = clientReturning(jsonResponse(200, session));

    await expect(
      client.logIn({ email: "ada@example.com", password: "x" }),
    ).resolves.toEqual(session);
    expect(fetchImpl.mock.calls[0]?.[0]).toBe("http://api.test/v1/auth/login");
  });

  it("US-A02 AC-A02.5 sends the CSRF token on logout", async () => {
    const { client, fetchImpl } = clientReturning(
      new Response(null, { status: 204 }),
    );

    await client.logOut("csrf-token");

    expect(fetchImpl).toHaveBeenCalledWith("http://api.test/v1/auth/logout", {
      credentials: "include",
      headers: { accept: "application/json", "x-csrf-token": "csrf-token" },
      method: "POST",
    });
  });

  it("US-A02 AC-A02.4 returns null from me() when not signed in", async () => {
    const { client } = clientReturning(
      jsonResponse(
        401,
        errorBody("UNAUTHENTICATED", "Authentication required."),
      ),
    );

    await expect(client.me()).resolves.toBeNull();
  });

  it("returns the current session from me()", async () => {
    const { client } = clientReturning(jsonResponse(200, session));

    await expect(client.me()).resolves.toEqual(session);
  });

  it("US-A01 AC-A01.2 surfaces the error code and field messages", async () => {
    const { client } = clientReturning(
      jsonResponse(
        409,
        errorBody("CONFLICT", "Some fields are already in use.", {
          email: ["Is already in use."],
        }),
      ),
    );

    const error = await client
      .register({
        email: "ada@example.com",
        password: "correct horse battery",
        username: "ada",
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      code: "CONFLICT",
      fields: { email: ["Is already in use."] },
      status: 409,
    });
  });

  it("rethrows unexpected failures from me()", async () => {
    const { client } = clientReturning(
      jsonResponse(500, errorBody("INTERNAL_ERROR", "Something went wrong.")),
    );

    await expect(client.me()).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 500,
    });
  });

  it("maps a non-contract error body to a generic error", async () => {
    const { client } = clientReturning(
      new Response("<html>Bad gateway</html>", { status: 502 }),
    );

    await expect(
      client.logIn({ email: "a@b.co", password: "x" }),
    ).rejects.toMatchObject({
      code: "INTERNAL_ERROR",
      status: 502,
    });
  });

  it("maps a network failure to NETWORK_ERROR", async () => {
    const { client } = clientReturning(new TypeError("Failed to fetch"));

    await expect(
      client.logIn({ email: "a@b.co", password: "x" }),
    ).rejects.toMatchObject({
      code: "NETWORK_ERROR",
      status: 0,
    });
  });
});
