"use client";

import {
  codePointLength,
  createTweetRequestSchema,
  TWEET_MAX_LENGTH,
} from "@twitter-clone/contracts";
import { CircleAlertIcon } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";

import { apiFormErrors, type FormErrors, NO_ERRORS } from "../lib/form-errors";
import { type TweetAuthorRef, useCreateTweet } from "../lib/tweets";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/** Below this many remaining characters the count is announced. */
const ANNOUNCE_AT = 20;

function limitAnnouncement(remaining: number): string {
  if (remaining < 0) {
    const over = -remaining;
    return `${over} ${over === 1 ? "character" : "characters"} over the limit.`;
  }
  return remaining <= ANNOUNCE_AT ? `${remaining} characters left.` : "";
}

/**
 * Tweet composer (US-B01, AC-B01.4). Counts code points of the trimmed text,
 * like the API, so emoji count once; no maxLength, which counts UTF-16 units.
 */
export function TweetComposer({
  member,
}: Readonly<{ member: TweetAuthorRef }>) {
  const createTweet = useCreateTweet(member);
  const [content, setContent] = useState("");
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [posted, setPosted] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Blocks a second submit before the disabled state re-renders.
  const submitting = useRef(false);

  const remaining = TWEET_MAX_LENGTH - codePointLength(content.trim());
  const over = remaining < 0;
  const empty = content.trim().length === 0;
  const fieldErrors = errors.fields.content ?? [];
  const invalid = over || fieldErrors.length > 0;

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createTweetRequestSchema.safeParse({ content });
    if (submitting.current || !parsed.success) {
      return;
    }
    submitting.current = true;
    setErrors(NO_ERRORS);
    setPosted(false);
    createTweet.mutate(parsed.data, {
      onError: (error) => setErrors(apiFormErrors(error)),
      onSettled: () => {
        submitting.current = false;
      },
      onSuccess: () => {
        setContent("");
        setPosted(true);
        textareaRef.current?.focus();
      },
    });
  }

  return (
    <form
      aria-label="Post a tweet"
      className="grid gap-3"
      // POST, so a submit before hydration never puts the text in the URL.
      method="post"
      noValidate
      onSubmit={onSubmit}
    >
      {errors.form === null ? null : (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}
      <Field data-invalid={invalid}>
        <FieldLabel htmlFor="tweet-content">What&apos;s happening?</FieldLabel>
        <Textarea
          aria-describedby={
            fieldErrors.length > 0
              ? "tweet-content-hint tweet-content-error"
              : "tweet-content-hint"
          }
          aria-invalid={invalid}
          id="tweet-content"
          name="content"
          onChange={(event) => {
            setContent(event.target.value);
            setPosted(false);
          }}
          ref={textareaRef}
          rows={3}
          value={content}
        />
        <FieldDescription id="tweet-content-hint">
          Up to {TWEET_MAX_LENGTH} characters.
        </FieldDescription>
        <FieldError
          errors={fieldErrors.map((message) => ({ message }))}
          id="tweet-content-error"
        />
      </Field>
      <div className="flex items-center justify-between gap-3">
        <span
          aria-hidden="true"
          className={
            over
              ? "text-sm font-semibold text-destructive tabular-nums"
              : "text-sm text-muted-foreground tabular-nums"
          }
          data-testid="tweet-counter"
        >
          {remaining}
        </span>
        <p
          aria-live="polite"
          className="sr-only"
          data-testid="tweet-limit-announcement"
        >
          {limitAnnouncement(remaining)}
        </p>
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground" role="status">
            {posted ? "Posted." : ""}
          </p>
          <Button
            aria-busy={createTweet.isPending}
            disabled={empty || over || createTweet.isPending}
            type="submit"
          >
            {createTweet.isPending ? "Posting…" : "Post"}
          </Button>
        </div>
      </div>
    </form>
  );
}
