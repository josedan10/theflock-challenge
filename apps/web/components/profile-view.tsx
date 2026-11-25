"use client";

import { updateProfileRequestSchema } from "@twitter-clone/contracts";
import {
  CircleAlertIcon,
  PencilIcon,
  RotateCwIcon,
  UserRoundIcon,
} from "lucide-react";
import Link from "next/link";
import { type FormEvent, useRef, useState } from "react";

import { ApiError } from "../lib/api-client";
import {
  apiFormErrors,
  type FormErrors,
  NO_ERRORS,
  zodFieldErrors,
} from "../lib/form-errors";
import { usePublicProfile, useSession, useUpdateProfile } from "../lib/session";

import { ProfileSkeleton } from "./skeletons";
import { TextField } from "./text-field";
import { useFocusFirstError } from "./use-focus-first-error";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";

/** Public, responsive profile route for PROFILE-01 and US-A03. */
export function ProfileView({ username }: Readonly<{ username: string }>) {
  const profileQuery = usePublicProfile(username);
  const session = useSession();

  if (profileQuery.isPending) {
    return <ProfileSkeleton label="Loading profile…" />;
  }
  if (profileQuery.isError) {
    const notFound =
      profileQuery.error instanceof ApiError &&
      profileQuery.error.code === "NOT_FOUND";
    return (
      <Card>
        <CardHeader>
          <h1 className="text-2xl font-semibold">
            {notFound ? "Profile not found" : "We couldn't load this profile"}
          </h1>
        </CardHeader>
        <CardContent className="grid gap-4">
          <p className="text-muted-foreground">
            {notFound
              ? "That profile does not exist."
              : "Check your connection and try again."}
          </p>
          {notFound ? (
            <Link className={buttonVariants({ variant: "outline" })} href="/">
              Go home
            </Link>
          ) : (
            <Button onClick={() => void profileQuery.refetch()} type="button">
              <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
              Try again
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  const { profile } = profileQuery.data;
  const isOwner = session.isSuccess && session.data?.user.id === profile.id;

  return (
    <article
      aria-labelledby="profile-heading"
      className="content-enter grid gap-4"
    >
      <Card className="overflow-hidden">
        <div aria-hidden="true" className="h-24 bg-muted sm:h-32" />
        <CardContent className="grid gap-6 pb-6">
          <div className="-mt-12 flex flex-wrap items-end justify-between gap-4 sm:-mt-14">
            <ProfileAvatar
              avatarUrl={profile.avatarUrl}
              displayName={profile.displayName}
            />
            {isOwner ? <EditProfile profile={profile} /> : null}
          </div>

          <div className="grid gap-1">
            <h1
              className="text-2xl leading-tight font-bold sm:text-3xl"
              id="profile-heading"
            >
              {profile.displayName}
            </h1>
            <p className="text-muted-foreground">@{profile.username}</p>
          </div>

          <p className="whitespace-pre-wrap break-words">
            {profile.bio.length === 0 ? (
              <span className="text-muted-foreground">No bio yet.</span>
            ) : (
              profile.bio
            )}
          </p>

          <dl
            aria-label="Profile statistics"
            className="grid grid-cols-3 gap-2 border-t pt-4 text-center"
          >
            <ProfileCount label="Tweets" value={profile.tweetCount} />
            <ProfileCount
              href={`/u/${encodeURIComponent(profile.username)}/followers`}
              label="Followers"
              value={profile.followerCount}
            />
            <ProfileCount
              href={`/u/${encodeURIComponent(profile.username)}/following`}
              label="Following"
              value={profile.followingCount}
            />
          </dl>
        </CardContent>
      </Card>
      <p className="text-sm text-muted-foreground">
        Accounts and posts are public.
      </p>
    </article>
  );
}

function ProfileAvatar({
  avatarUrl,
  displayName,
}: Readonly<{ avatarUrl: string | null; displayName: string }>) {
  const className =
    "grid size-24 shrink-0 place-items-center overflow-hidden rounded-full border-4 border-card bg-muted sm:size-28";
  if (avatarUrl !== null) {
    return (
      // The API returns only validated upload URLs; dimensions prevent layout shift.
      <img
        alt={`${displayName}'s avatar`}
        className={`${className} object-cover`}
        height={112}
        src={avatarUrl}
        width={112}
      />
    );
  }
  return (
    <div
      aria-label={`${displayName}'s avatar placeholder`}
      className={className}
      role="img"
    >
      <UserRoundIcon
        aria-hidden="true"
        className="size-10 text-muted-foreground"
      />
    </div>
  );
}

/** One statistic; follower and following counts link to their lists (US-C03). */
function ProfileCount({
  href,
  label,
  value,
}: Readonly<{ href?: string; label: string; value: number }>) {
  return (
    <div className="flex min-w-0 flex-col">
      <dt className="order-2 truncate text-sm text-muted-foreground">
        {label}
      </dt>
      <dd className="order-1 text-lg font-semibold tabular-nums">
        {href === undefined ? (
          value
        ) : (
          <Link
            aria-label={`${value} ${label}`}
            className="inline-flex min-h-11 min-w-11 items-center justify-center underline-offset-4 hover:underline"
            href={href}
          >
            {value}
          </Link>
        )}
      </dd>
    </div>
  );
}

function EditProfile({
  profile,
}: Readonly<{
  profile: {
    bio: string;
    displayName: string;
    username: string;
  };
}>) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateProfile(profile.username);
  const formRef = useRef<HTMLFormElement>(null);
  const [errors, setErrors] = useState<FormErrors>(NO_ERRORS);
  useFocusFirstError(formRef, errors);

  function close() {
    setErrors(NO_ERRORS);
    setEditing(false);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const parsed = updateProfileRequestSchema.safeParse({
      bio: String(data.get("bio") ?? ""),
      displayName: String(data.get("displayName") ?? ""),
    });
    if (!parsed.success) {
      setErrors({
        fields: zodFieldErrors(parsed.error),
        form: "Fix the highlighted fields.",
      });
      return;
    }
    setErrors(NO_ERRORS);
    update.mutate(parsed.data, {
      onError: (error) => setErrors(apiFormErrors(error)),
      onSuccess: close,
    });
  }

  if (!editing) {
    return (
      <Button
        className="min-h-11"
        onClick={() => setEditing(true)}
        type="button"
        variant="outline"
      >
        <PencilIcon aria-hidden="true" data-icon="inline-start" />
        Edit profile
      </Button>
    );
  }

  const bioErrors = errors.fields.bio ?? [];
  return (
    <form
      aria-label="Edit profile"
      className="grid w-full basis-full gap-4 rounded-lg border bg-card p-4"
      noValidate
      onSubmit={onSubmit}
      ref={formRef}
    >
      <h2 className="text-lg font-semibold">Edit profile</h2>
      {errors.form === null ? null : (
        <Alert variant="destructive">
          <CircleAlertIcon aria-hidden="true" />
          <AlertDescription>{errors.form}</AlertDescription>
        </Alert>
      )}
      <FieldGroup>
        <TextField
          defaultValue={profile.displayName}
          errors={errors.fields.displayName}
          label="Display name"
          maxLength={80}
          name="displayName"
          required
        />
        <Field data-invalid={bioErrors.length > 0}>
          <FieldLabel htmlFor="field-bio">Bio</FieldLabel>
          <textarea
            aria-describedby={
              bioErrors.length === 0
                ? "field-bio-hint"
                : "field-bio-hint field-bio-error"
            }
            aria-invalid={bioErrors.length > 0}
            className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-28 w-full resize-y rounded-md border bg-transparent px-3 py-2 text-base outline-none focus-visible:ring-[3px]"
            defaultValue={profile.bio}
            id="field-bio"
            maxLength={160}
            name="bio"
          />
          <FieldDescription id="field-bio-hint">
            Up to 160 characters. Plain text only.
          </FieldDescription>
          <FieldError
            errors={bioErrors.map((message) => ({ message }))}
            id="field-bio-error"
          />
        </Field>
      </FieldGroup>
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          className="min-h-11"
          disabled={update.isPending}
          onClick={close}
          type="button"
          variant="outline"
        >
          Cancel
        </Button>
        <Button
          aria-busy={update.isPending}
          className="min-h-11"
          disabled={update.isPending}
          type="submit"
        >
          {update.isPending ? "Saving…" : "Save profile"}
        </Button>
      </div>
    </form>
  );
}
