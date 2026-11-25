"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  codePointLength,
  createTweetRequestSchema,
  IMAGE_MAX_BYTES,
  IMAGE_MIME_TYPES,
  TWEET_MAX_LENGTH,
} from "@twitter-clone/contracts";
import { CircleAlertIcon, ImagePlusIcon, SendIcon, XIcon } from "lucide-react";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

import { ApiError } from "../lib/api-client";
import { apiFormErrors, type FormErrors, NO_ERRORS } from "../lib/form-errors";
import { sessionCsrfToken, useApiClient } from "../lib/session";
import { type TweetAuthorRef, useCreateTweet } from "../lib/tweets";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";
import { Spinner } from "@/components/ui/spinner";
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
  parentTweetId,
  uploadsEnabled = process.env.NEXT_PUBLIC_UPLOADS_ENABLED === "true",
}: Readonly<{
  member: TweetAuthorRef;
  parentTweetId?: string;
  /** Shows the image control when IMG-01 is enabled for this web build. */
  uploadsEnabled?: boolean;
}>) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const createTweet = useCreateTweet(member, parentTweetId);
  const replying = parentTweetId !== undefined;
  const [content, setContent] = useState("");
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  const [posted, setPosted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputId = useId();
  // Blocks a second submit before the disabled state re-renders.
  const submitting = useRef(false);

  useEffect(() => {
    return () => {
      if (previewUrl === null) {
        return;
      }
      try {
        URL.revokeObjectURL(previewUrl);
      } catch {
        // jsdom does not implement object URLs.
      }
    };
  }, [previewUrl]);

  const remaining = TWEET_MAX_LENGTH - codePointLength(content.trim());
  const over = remaining < 0;
  const empty = content.trim().length === 0;
  const fieldErrors = errors.fields.content ?? [];
  const imageErrors = errors.fields.image ?? [];
  const invalid = over || fieldErrors.length > 0;

  function clearImage() {
    setImageFile(null);
    setPreviewUrl(null);
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  }

  function onFile(file: File | undefined) {
    if (file === undefined) {
      return;
    }
    const allowed = IMAGE_MIME_TYPES.some((type) => type === file.type);
    if (!allowed || file.size < 1 || file.size > IMAGE_MAX_BYTES) {
      setErrors({
        fields: {
          image: ["Choose a JPEG, PNG, or WebP image up to 5 MB."],
        },
        form: null,
      });
      clearImage();
      return;
    }
    setErrors(NO_ERRORS);
    setImageFile(file);
    try {
      setPreviewUrl(URL.createObjectURL(file));
    } catch {
      setPreviewUrl(null);
    }
  }

  /**
   * ⌘+Enter (macOS) or Ctrl+Enter sends, through the form's normal submit so
   * the same validation and double-submit guard apply. Plain Enter keeps
   * adding a new line, and a key that finishes an IME composition is ignored.
   */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (
      event.key === "Enter" &&
      (event.metaKey || event.ctrlKey) &&
      !event.nativeEvent.isComposing
    ) {
      event.preventDefault();
      event.currentTarget.form?.requestSubmit();
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = createTweetRequestSchema.safeParse(
      imageFile === null
        ? { content }
        : {
            content,
            image: {
              uploadId: "00000000-0000-7000-8000-000000000001",
            },
          },
    );
    if (submitting.current || !parsed.success) {
      return;
    }
    submitting.current = true;
    setBusy(true);
    setErrors(NO_ERRORS);
    setPosted(false);
    const finish = () => {
      submitting.current = false;
      setBusy(false);
    };
    try {
      let image: { alt: string; uploadId: string } | undefined;
      if (imageFile !== null && parsed.data.image !== undefined) {
        const mimeType = imageFile.type;
        if (
          mimeType !== "image/jpeg" &&
          mimeType !== "image/png" &&
          mimeType !== "image/webp"
        ) {
          throw new ApiError(
            0,
            "VALIDATION_ERROR",
            "Choose a JPEG, PNG, or WebP image up to 5 MB.",
          );
        }
        const bytes = new Uint8Array(await imageFile.arrayBuffer());
        const csrfToken = sessionCsrfToken(queryClient);
        const intent = await apiClient.createUploadIntent(
          { byteSize: bytes.byteLength, mimeType },
          csrfToken,
        );
        await apiClient.uploadImage(
          intent.uploadPath,
          intent.uploadToken,
          bytes,
          csrfToken,
        );
        image = { alt: parsed.data.image.alt, uploadId: intent.uploadId };
      }
      createTweet.mutate(
        image === undefined
          ? { content: parsed.data.content }
          : { content: parsed.data.content, image },
        {
          onError: (error) => setErrors(apiFormErrors(error)),
          onSettled: finish,
          onSuccess: () => {
            setContent("");
            clearImage();
            setPosted(true);
            textareaRef.current?.focus();
          },
        },
      );
    } catch (error: unknown) {
      finish();
      setErrors(
        error instanceof ApiError
          ? apiFormErrors(error)
          : { fields: {}, form: "That image could not be uploaded." },
      );
    }
  }

  return (
    <form
      aria-label={replying ? "Post a reply" : "Post a tweet"}
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
        <FieldLabel htmlFor="tweet-content">
          {replying ? "Your reply" : "What's happening?"}
        </FieldLabel>
        <Textarea
          aria-describedby={
            fieldErrors.length > 0
              ? "tweet-content-hint tweet-content-error"
              : "tweet-content-hint"
          }
          aria-invalid={invalid}
          aria-keyshortcuts="Meta+Enter Control+Enter"
          id="tweet-content"
          name="content"
          onChange={(event) => {
            setContent(event.target.value);
            setPosted(false);
          }}
          onKeyDown={onKeyDown}
          ref={textareaRef}
          rows={3}
          value={content}
        />
        <FieldDescription id="tweet-content-hint">
          Up to {TWEET_MAX_LENGTH} characters. Press <kbd>⌘</kbd>{" "}
          <kbd>Enter</kbd> or <kbd>Ctrl</kbd> <kbd>Enter</kbd> to{" "}
          {replying ? "reply" : "post"}.
        </FieldDescription>
        <FieldError
          errors={fieldErrors.map((message) => ({ message }))}
          id="tweet-content-error"
        />
      </Field>
      {uploadsEnabled ? (
        <div className="grid gap-2">
          <input
            accept="image/jpeg,image/png,image/webp"
            aria-hidden="true"
            className="sr-only"
            id={imageInputId}
            onChange={(event) => onFile(event.target.files?.[0])}
            ref={fileInputRef}
            tabIndex={-1}
            type="file"
          />
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={() => fileInputRef.current?.click()}
              type="button"
              variant="outline"
            >
              <ImagePlusIcon aria-hidden="true" data-icon="inline-start" />
              {imageFile === null ? "Add image" : "Replace image"}
            </Button>
            {imageFile === null ? null : (
              <Button onClick={clearImage} type="button" variant="ghost">
                <XIcon aria-hidden="true" data-icon="inline-start" />
                Remove image
              </Button>
            )}
          </div>
          {previewUrl === null ? null : (
            // Local preview only. The posted image has an empty text alternative.
            <img
              alt=""
              className="max-h-48 w-full rounded-xl border object-contain"
              src={previewUrl}
            />
          )}
          {imageErrors.length === 0 ? null : (
            <FieldError errors={imageErrors.map((message) => ({ message }))} />
          )}
        </div>
      ) : null}
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
            {posted ? (replying ? "Reply posted." : "Posted.") : ""}
          </p>
          <Button
            aria-busy={busy || createTweet.isPending}
            disabled={empty || over || busy || createTweet.isPending}
            type="submit"
          >
            {busy || createTweet.isPending ? (
              <>
                <Spinner
                  aria-hidden="true"
                  aria-label={undefined}
                  className="motion-reduce:animate-none"
                  role="presentation"
                />
                Posting…
              </>
            ) : (
              <>
                <SendIcon aria-hidden="true" data-icon="inline-start" />
                {replying ? "Post reply" : "Post"}
              </>
            )}
          </Button>
        </div>
      </div>
    </form>
  );
}
