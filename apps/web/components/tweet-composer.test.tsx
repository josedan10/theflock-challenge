import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

import { ApiError } from "../lib/api-client";
import { useSession } from "../lib/session";

import {
  fakeApiClient,
  formAlert,
  renderWithSession,
  testSession,
  testTweet,
} from "./test-utils";
import { TweetComposer } from "./tweet-composer";

import type { ApiClient } from "../lib/api-client";

const member = { id: testSession.user.id, username: testSession.user.username };
const signedIn = (overrides: Partial<ApiClient> = {}) =>
  fakeApiClient({ me: vi.fn(async () => testSession), ...overrides });

/** Like HomeView: the composer mounts once the session (and CSRF token) is loaded. */
function SignedInComposer({
  uploadsEnabled = false,
}: {
  uploadsEnabled?: boolean;
} = {}) {
  const session = useSession();
  return session.data ? (
    <TweetComposer member={member} uploadsEnabled={uploadsEnabled} />
  ) : null;
}

async function renderComposer(apiClient = signedIn(), uploadsEnabled = false) {
  const view = renderWithSession(
    <SignedInComposer uploadsEnabled={uploadsEnabled} />,
    apiClient,
  );
  await screen.findByRole("textbox", { name: "What's happening?" });
  return view;
}

const textbox = () =>
  screen.getByRole("textbox", { name: "What's happening?" });
const submit = () => screen.getByRole("button", { name: /^Post/ });
const counter = () => screen.getByTestId("tweet-counter");
/** Paste-like input: user-event types emoji one key at a time, which is slow. */
const enter = (text: string) =>
  fireEvent.change(textbox(), { target: { value: text } });

describe("TweetComposer counter", () => {
  it("US-B01 AC-B01.4 shows the remaining characters", async () => {
    await renderComposer();

    await userEvent.type(textbox(), "hello");

    expect(counter()).toHaveTextContent("275");
  });

  it("US-B01 AC-B01.1 counts emoji once and allows exactly 280", async () => {
    await renderComposer();

    enter("🐦".repeat(280));

    expect(counter()).toHaveTextContent("0");
    expect(submit()).toBeEnabled();
  });

  it("US-B01 AC-B01.2 marks 281 characters as over the limit and blocks posting", async () => {
    await renderComposer();

    enter("a".repeat(281));

    expect(counter()).toHaveTextContent("-1");
    expect(textbox()).toHaveAttribute("aria-invalid", "true");
    expect(submit()).toBeDisabled();
    expect(screen.getByTestId("tweet-limit-announcement")).toHaveTextContent(
      "1 character over the limit.",
    );
  });

  it("does not count surrounding whitespace", async () => {
    await renderComposer();

    enter("  hi  ");

    expect(counter()).toHaveTextContent("278");
  });

  it("announces the count only when close to or over the limit", async () => {
    await renderComposer();

    enter("a".repeat(259));
    expect(
      screen.getByTestId("tweet-limit-announcement"),
    ).toBeEmptyDOMElement();

    enter("a".repeat(260));
    expect(screen.getByTestId("tweet-limit-announcement")).toHaveTextContent(
      "20 characters left.",
    );
  });
});

describe("TweetComposer submit", () => {
  it("US-B01 AC-B01.2 keeps posting disabled for empty or whitespace-only text", async () => {
    const apiClient = signedIn();
    await renderComposer(apiClient);

    expect(submit()).toBeDisabled();
    enter("   ");
    expect(submit()).toBeDisabled();
    expect(apiClient.createTweet).not.toHaveBeenCalled();
  });

  it("US-B01 AC-B01.4 sends exactly one request when submitted twice while pending", async () => {
    let finish: () => void = () => undefined;
    const apiClient = signedIn({
      createTweet: vi.fn(
        () =>
          new Promise<{ tweet: typeof testTweet }>((resolve) => {
            finish = () => resolve({ tweet: testTweet });
          }),
      ),
    });
    await renderComposer(apiClient);
    enter("hello");

    const form = textbox().closest("form") as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);

    expect(
      await screen.findByRole("button", { name: "Posting…" }),
    ).toBeDisabled();
    expect(
      screen
        .getByRole("button", { name: "Posting…" })
        .querySelector("[data-slot=spinner]"),
    ).toBeInTheDocument();
    expect(apiClient.createTweet).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(
      await screen.findByRole("button", { name: "Post" }, { timeout: 3_000 }),
    ).toBeDisabled();
  });

  it("US-B01 AC-B01.4 announces success, clears the text, and keeps focus in the composer", async () => {
    const apiClient = signedIn();
    await renderComposer(apiClient);
    const user = userEvent.setup();

    await user.type(textbox(), "  First post!  ");
    await user.click(submit());

    expect(
      await screen.findByText("Posted.", {}, { timeout: 3_000 }),
    ).toBeInTheDocument();
    expect(textbox()).toHaveValue("");
    expect(textbox()).toHaveFocus();
    expect(apiClient.createTweet).toHaveBeenCalledWith(
      { content: "First post!" },
      testSession.csrfToken,
    );
  });
});

describe("TweetComposer failures", () => {
  async function failWith(error: ApiError) {
    const apiClient = signedIn({
      createTweet: vi.fn(async () => {
        throw error;
      }),
    });
    await renderComposer(apiClient);
    const user = userEvent.setup();
    await user.type(textbox(), "hello");
    await user.click(submit());
    return apiClient;
  }

  it("US-B01 AC-B01.4 shows the API's field message and keeps the text", async () => {
    await failWith(
      new ApiError(422, "VALIDATION_ERROR", "Some fields are invalid.", {
        content: ["Write something to post."],
      }),
    );

    await waitFor(
      () =>
        expect(textbox()).toHaveAccessibleDescription(
          expect.stringContaining("Write something to post."),
        ),
      { timeout: 3_000 },
    );
    expect(textbox()).toHaveValue("hello");
    expect(submit()).toBeEnabled();
  });

  it("explains rate limiting with retry guidance", async () => {
    await failWith(new ApiError(429, "RATE_LIMITED", "Too many requests."));

    await waitFor(
      () =>
        expect(formAlert()).toHaveTextContent(
          "Too many attempts. Wait a minute and try again.",
        ),
      { timeout: 3_000 },
    );
    expect(textbox()).toHaveValue("hello");
  });

  it("explains a network failure and lets the member retry once", async () => {
    const apiClient = await failWith(
      new ApiError(
        0,
        "NETWORK_ERROR",
        "Can't reach the server. Check your connection and try again.",
      ),
    );

    await waitFor(
      () => expect(formAlert()).toHaveTextContent("Can't reach the server"),
      { timeout: 3_000 },
    );
    await userEvent.click(submit());
    await waitFor(() => expect(apiClient.createTweet).toHaveBeenCalledTimes(2));
  });
});

describe("TweetComposer keyboard shortcut", () => {
  it.each([
    ["⌘+Enter", "{Meta>}{Enter}{/Meta}"],
    ["Ctrl+Enter", "{Control>}{Enter}{/Control}"],
  ])("US-B01 posts with %s", async (_name, keys) => {
    const createTweet = vi.fn(async (input: { content: string }) => ({
      tweet: { ...testTweet, content: input.content },
    }));
    await renderComposer(signedIn({ createTweet }));
    const user = userEvent.setup();

    await user.type(textbox(), "Sent from the keyboard");
    await user.keyboard(keys);

    await waitFor(() =>
      expect(createTweet).toHaveBeenCalledWith(
        { content: "Sent from the keyboard" },
        testSession.csrfToken,
      ),
    );
    await waitFor(() => expect(textbox()).toHaveValue(""));
  });

  it("US-B01 keeps plain Enter as a new line", async () => {
    const createTweet = vi.fn();
    await renderComposer(signedIn({ createTweet }));
    const user = userEvent.setup();

    await user.type(textbox(), "line one{Enter}line two");

    expect(textbox()).toHaveValue("line one\nline two");
    expect(createTweet).not.toHaveBeenCalled();
  });

  it("US-B01 AC-B01.4 applies the usual rules: nothing empty or over the limit is sent", async () => {
    const createTweet = vi.fn();
    await renderComposer(signedIn({ createTweet }));
    const user = userEvent.setup();

    textbox().focus();
    await user.keyboard("{Control>}{Enter}{/Control}");
    enter("a".repeat(281));
    textbox().focus();
    await user.keyboard("{Meta>}{Enter}{/Meta}");

    expect(createTweet).not.toHaveBeenCalled();
  });

  it("US-B01 AC-B01.4 sends once even when the shortcut is pressed twice", async () => {
    let finish: () => void = () => undefined;
    const createTweet = vi.fn(
      () =>
        new Promise<{ tweet: typeof testTweet }>((resolve) => {
          finish = () => resolve({ tweet: testTweet });
        }),
    );
    await renderComposer(signedIn({ createTweet }));
    const user = userEvent.setup();

    await user.type(textbox(), "once");
    await user.keyboard("{Control>}{Enter}{Enter}{/Control}");
    await act(async () => finish());

    expect(createTweet).toHaveBeenCalledTimes(1);
  });

  it("US-B01 announces the shortcut in the hint and to assistive tech", async () => {
    await renderComposer();

    expect(textbox()).toHaveAttribute(
      "aria-keyshortcuts",
      "Meta+Enter Control+Enter",
    );
    expect(textbox()).toHaveAccessibleDescription(/Enter.*to post/);
  });
});

describe("TweetComposer image", () => {
  it("US-F02 AC-F02.4 uploads one image and posts the verified id with its description", async () => {
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      ),
      (char) => char.charCodeAt(0),
    );
    const createUploadIntent = vi.fn(async () => ({
      expiresAt: "2026-11-24T12:15:00.000Z",
      uploadId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70",
      uploadPath:
        "/v1/media/uploads/0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70/content",
      uploadToken: "token",
    }));
    const uploadImage = vi.fn(async () => undefined);
    const createTweet = vi.fn(async (input: { content: string }) => ({
      tweet: { ...testTweet, content: input.content },
    }));
    await renderComposer(
      signedIn({ createTweet, createUploadIntent, uploadImage }),
      true,
    );
    const user = userEvent.setup();
    const input = document.querySelector('input[type="file"]');
    if (!(input instanceof HTMLInputElement)) {
      throw new Error("image input missing");
    }
    await user.upload(input, new File([png], "dot.png", { type: "image/png" }));
    await user.type(textbox(), "With a picture");
    await user.type(
      screen.getByRole("textbox", { name: "Image description" }),
      "A dot",
    );
    await user.click(submit());

    await waitFor(() => expect(createTweet).toHaveBeenCalled());
    expect(createUploadIntent).toHaveBeenCalledWith(
      { byteSize: png.byteLength, mimeType: "image/png" },
      testSession.csrfToken,
    );
    expect(uploadImage).toHaveBeenCalledWith(
      "/v1/media/uploads/0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70/content",
      "token",
      expect.any(Uint8Array),
      testSession.csrfToken,
    );
    expect(createTweet).toHaveBeenCalledWith(
      {
        content: "With a picture",
        image: {
          alt: "A dot",
          uploadId: "0190f3a4-7c2b-7d1e-8a3f-1b2c3d4e5f70",
        },
      },
      testSession.csrfToken,
    );
    expect(
      screen.queryByRole("img", { name: "A dot" }),
    ).not.toBeInTheDocument();
  });
});
