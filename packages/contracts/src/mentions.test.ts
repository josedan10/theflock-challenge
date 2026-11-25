import { describe, expect, it } from "vitest";

import {
  MENTION_LIMIT,
  mentionDraft,
  mentionedUsernames,
  mentionSpans,
} from "./mentions";

describe("mentionedUsernames", () => {
  it("US-B05 reads distinct @handles and ignores emails and short tokens", () => {
    expect(
      mentionedUsernames("Hey @Grace, ask @grace and ada@example.com or @ab"),
    ).toEqual(["grace"]);
  });

  it("US-B05 stops after the mention limit", () => {
    const handles = Array.from({ length: MENTION_LIMIT + 2 }, (_, index) => {
      return `@user${String(index).padStart(2, "0")}`;
    });
    expect(mentionedUsernames(handles.join(" "))).toHaveLength(MENTION_LIMIT);
  });

  it("US-B05 keeps every @handle visible when the text is split", () => {
    expect(mentionSpans("Hi @Ada!")).toEqual([
      { kind: "text", text: "Hi " },
      { kind: "mention", text: "@Ada", username: "ada" },
      { kind: "text", text: "!" },
    ]);
  });

  it("US-B05 finds the handle currently being typed", () => {
    const content = "Hello @Gr";
    expect(mentionDraft(content, content.length)).toEqual({
      query: "Gr",
      start: 6,
    });
    expect(mentionDraft("ada@example.com", 4)).toBeNull();
    expect(mentionDraft("Hello @Grace there", 8)).toEqual({
      query: "G",
      start: 6,
    });
  });
});
