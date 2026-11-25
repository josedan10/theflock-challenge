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

const profile = {
  ...session.user,
  followerCount: 0,
  followingCount: 0,
  tweetCount: 0,
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
  it("US-A03 AC-A03.1 reads and validates an encoded public profile", async () => {
    const { client, fetchImpl } = clientReturning(
      jsonResponse(200, { profile }),
    );

    await expect(client.getProfile("ada/user")).resolves.toEqual({ profile });
    expect(fetchImpl.mock.calls[0]?.[0]).toBe(
      "http://api.test/v1/users/ada%2Fuser",
    );
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
  });

  it("PROFILE-02 updates the profile with the session CSRF token", async () => {
    const { client, fetchImpl } = clientReturning(
      jsonResponse(200, { profile }),
    );
    const input = { bio: "Analyst" };

    await expect(client.updateProfile(input, "csrf-token")).resolves.toEqual({
      profile,
    });
    expect(fetchImpl).toHaveBeenCalledWith("http://api.test/v1/me/profile", {
      body: JSON.stringify(input),
      credentials: "include",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "x-csrf-token": "csrf-token",
      },
      method: "PATCH",
    });
  });

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

  describe("tweets", () => {
    const tweet = {
      author: {
        avatarUrl: null,
        displayName: "Ada",
        id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f60",
        username: "ada",
      },
      content: "First post!",
      createdAt: "2026-11-24T12:00:00.000Z",
      id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
      likeCount: 0,
      likedByViewer: false,
      replyCount: 0,
    };

    it("US-B01 AC-B01.1 posts a tweet with the CSRF token and parses the card", async () => {
      const { client, fetchImpl } = clientReturning(
        jsonResponse(201, { tweet }),
      );

      await expect(
        client.createTweet({ content: "First post!" }, "csrf-token"),
      ).resolves.toEqual({ tweet });
      expect(fetchImpl).toHaveBeenCalledWith("http://api.test/v1/tweets", {
        body: JSON.stringify({ content: "First post!" }),
        credentials: "include",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          "x-csrf-token": "csrf-token",
        },
        method: "POST",
      });
    });

    it("US-B02 AC-B02.1 deletes a tweet by encoded id with the CSRF token", async () => {
      const { client, fetchImpl } = clientReturning(
        new Response(null, { status: 204 }),
      );

      await client.deleteTweet("id/with?chars", "csrf-token");

      expect(fetchImpl).toHaveBeenCalledWith(
        "http://api.test/v1/tweets/id%2Fwith%3Fchars",
        {
          credentials: "include",
          headers: { accept: "application/json", "x-csrf-token": "csrf-token" },
          method: "DELETE",
        },
      );
    });

    it("US-B03 AC-B03.3 reads the first page with credentials and no CSRF header", async () => {
      const { client, fetchImpl } = clientReturning(
        jsonResponse(200, { items: [tweet], nextCursor: null }),
      );

      await expect(client.getTimeline()).resolves.toEqual({
        items: [tweet],
        nextCursor: null,
      });
      expect(fetchImpl).toHaveBeenCalledWith("http://api.test/v1/timeline", {
        credentials: "include",
        headers: { accept: "application/json" },
        method: "GET",
      });
    });

    it("US-B03 AC-B03.3 sends the opaque cursor without storing it", async () => {
      const { client, fetchImpl } = clientReturning(
        jsonResponse(200, { items: [], nextCursor: null }),
      );

      await client.getTimeline("a+b/c=");

      expect(fetchImpl.mock.calls[0]?.[0]).toBe(
        "http://api.test/v1/timeline?cursor=a%2Bb%2Fc%3D",
      );
      expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
        credentials: "include",
        headers: { accept: "application/json" },
        method: "GET",
      });
    });

    it("rejects a timeline body that breaks the contract", async () => {
      const { client } = clientReturning(
        jsonResponse(200, { items: [], nextCursor: 1 }),
      );

      await expect(client.getTimeline()).rejects.toThrow();
    });

    it("US-B02 AC-B02.2 surfaces a forbidden delete as an ApiError", async () => {
      const { client } = clientReturning(
        jsonResponse(
          403,
          errorBody("FORBIDDEN", "You can only delete your own tweets."),
        ),
      );

      await expect(
        client.deleteTweet(tweet.id, "csrf-token"),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        status: 403,
      });
    });
  });

  describe("follows", () => {
    const relationship = { followerCount: 3, following: true };
    const member = {
      followedByViewer: false,
      isViewer: false,
      user: {
        avatarUrl: null,
        displayName: "Grace",
        id: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f61",
        username: "grace",
      },
    };

    it("US-C01 AC-C01.1 follows by encoded username with the CSRF token", async () => {
      const { client, fetchImpl } = clientReturning(
        jsonResponse(200, { relationship }),
      );

      await expect(client.follow("grace", "csrf-token")).resolves.toEqual({
        relationship,
      });
      expect(fetchImpl).toHaveBeenCalledWith(
        "http://api.test/v1/users/grace/follow",
        {
          credentials: "include",
          headers: { accept: "application/json", "x-csrf-token": "csrf-token" },
          method: "PUT",
        },
      );
    });

    it("US-C01 AC-C01.2 unfollows with DELETE", async () => {
      const { client, fetchImpl } = clientReturning(
        jsonResponse(200, {
          relationship: { followerCount: 2, following: false },
        }),
      );

      await client.unfollow("a/b", "csrf-token");

      expect(fetchImpl.mock.calls[0]?.[0]).toBe(
        "http://api.test/v1/users/a%2Fb/follow",
      );
      expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "DELETE" });
    });

    it("US-C03 AC-C03.1 reads a follow list page with an encoded cursor", async () => {
      const { client, fetchImpl } = clientReturning(
        jsonResponse(200, { items: [member], nextCursor: null }),
      );

      await expect(
        client.getFollowList("grace", "followers", "a+b"),
      ).resolves.toEqual({ items: [member], nextCursor: null });
      expect(fetchImpl.mock.calls[0]?.[0]).toBe(
        "http://api.test/v1/users/grace/followers?cursor=a%2Bb",
      );
      expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({
        credentials: "include",
        method: "GET",
      });
    });

    it("US-C03 reads the first following page without a cursor", async () => {
      const { client, fetchImpl } = clientReturning(
        jsonResponse(200, { items: [], nextCursor: null }),
      );

      await client.getFollowList("grace", "following");

      expect(fetchImpl.mock.calls[0]?.[0]).toBe(
        "http://api.test/v1/users/grace/following",
      );
    });
  });
});

describe("THR-01 client", () => {
  const tweet = {
    id: session.user.id,
    author: {
      avatarUrl: null,
      id: session.user.id,
      username: "ada",
      displayName: "Ada",
    },
    createdAt: session.user.createdAt,
    content: "reply",
    likeCount: 0,
    likedByViewer: false,
    replyCount: 0,
  };
  it("AC-B04.1 sends CSRF on reply creation without allowing an author field", async () => {
    const { client, fetchImpl } = clientReturning(jsonResponse(201, { tweet }));
    await expect(
      client.createReply("parent/id", { content: "reply" }, "csrf"),
    ).resolves.toEqual({ tweet });
    expect(fetchImpl).toHaveBeenCalledWith(
      "http://api.test/v1/tweets/parent%2Fid/replies",
      expect.objectContaining({
        method: "POST",
        body: '{"content":"reply"}',
        headers: expect.objectContaining({ "x-csrf-token": "csrf" }),
      }),
    );
  });
  it.each([undefined, "cursor+test"])(
    "AC-B04.2 validates a public thread page",
    async (cursor) => {
      const page = {
        selected: { ...tweet, parentTweetId: null },
        items: [],
        nextCursor: null,
      };
      const { client, fetchImpl } = clientReturning(jsonResponse(200, page));
      await expect(client.getThread(tweet.id, cursor)).resolves.toEqual(page);
      expect(fetchImpl).toHaveBeenCalledWith(
        `http://api.test/v1/tweets/${tweet.id}/thread${cursor ? "?cursor=cursor%2Btest" : ""}`,
        expect.objectContaining({ method: "GET", credentials: "include" }),
      );
    },
  );
});
