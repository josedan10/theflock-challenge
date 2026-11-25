"use client";

import {
  USER_SEARCH_MAX_LENGTH,
  USER_SEARCH_MIN_LENGTH,
} from "@twitter-clone/contracts";
import {
  CircleAlertIcon,
  RotateCwIcon,
  SearchIcon,
  SearchXIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { ApiError } from "../lib/api-client";
import {
  SEARCH_DEBOUNCE_MS,
  searchTextState,
  useDebouncedValue,
  useUserSearch,
} from "../lib/search";
import { useSession } from "../lib/session";
import { useHydrated } from "../lib/use-hydrated";

import { MemberRow } from "./member-row";
import { FollowListSkeleton } from "./skeletons";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@/components/ui/input-group";

/** Keeps the settled query in the address bar without a server round trip. */
function syncQueryParam(text: string): void {
  const url = new URL(window.location.href);
  if (text.length === 0) {
    url.searchParams.delete("q");
  } else {
    url.searchParams.set("q", text);
  }
  if (url.href !== window.location.href) {
    window.history.replaceState(window.history.state, "", url);
  }
}

/**
 * People search (US-D01, SRC-02). Requests wait for a typing pause and for
 * 2–50 characters (AC-D01.4); results show the same rows as follow lists,
 * with clear loading, empty and error states. Members only: a signed-out
 * visitor is sent to /login, like home.
 */
export function UserSearchView({
  initialQuery = "",
}: Readonly<{ initialQuery?: string }>) {
  const router = useRouter();
  const session = useSession();
  const hydrated = useHydrated();
  const [raw, setRaw] = useState(initialQuery);
  const settled = useDebouncedValue(raw, SEARCH_DEBOUNCE_MS);
  const state = searchTextState(settled);
  const typing = searchTextState(raw);
  const search = useUserSearch(state.kind === "ready" ? state.text : null);
  const viewer = hydrated ? (session.data?.user ?? null) : null;
  const signedOut = session.isSuccess && session.data === null;

  useEffect(() => {
    if (signedOut) {
      router.replace("/login");
    }
  }, [router, signedOut]);

  useEffect(() => {
    syncQueryParam(settled.trim());
  }, [settled]);

  useEffect(() => {
    if (
      search.error instanceof ApiError &&
      search.error.code === "UNAUTHENTICATED"
    ) {
      router.replace("/login");
    }
  }, [router, search.error]);

  const items = search.data?.items ?? [];
  const tooLong = typing.kind === "too-long";
  const showResults = state.kind === "ready";

  return (
    <section aria-labelledby="search-heading" className="grid gap-4">
      <h1 className="text-2xl font-bold" id="search-heading">
        Search people
      </h1>

      <form
        onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()}
        role="search"
      >
        <Field data-invalid={tooLong}>
          <FieldLabel htmlFor="people-search">Name or username</FieldLabel>
          <InputGroup className="h-11">
            <InputGroupAddon>
              <SearchIcon aria-hidden="true" />
            </InputGroupAddon>
            <InputGroupInput
              aria-describedby="people-search-hint"
              aria-invalid={tooLong}
              autoComplete="off"
              enterKeyHint="search"
              id="people-search"
              name="q"
              onChange={(event) => setRaw(event.target.value)}
              placeholder="Search by name or @username"
              spellCheck={false}
              type="search"
              value={raw}
            />
          </InputGroup>
          <FieldDescription
            className={tooLong ? "text-destructive" : undefined}
            id="people-search-hint"
          >
            {tooLong
              ? `Use at most ${USER_SEARCH_MAX_LENGTH} characters.`
              : `Enter at least ${USER_SEARCH_MIN_LENGTH} characters.`}
          </FieldDescription>
        </Field>
      </form>

      <p aria-live="polite" className="sr-only" data-testid="search-announcer">
        {showResults && search.isSuccess && !search.isPlaceholderData
          ? items.length === 0
            ? "No people found."
            : `${items.length} ${items.length === 1 ? "person" : "people"} found.`
          : ""}
      </p>

      {state.kind === "empty" ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>Find people to follow</EmptyTitle>
            <EmptyDescription>
              Search by display name or username.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {state.kind === "too-short" ? (
        <p className="text-sm text-muted-foreground">
          Keep typing: at least {USER_SEARCH_MIN_LENGTH} characters.
        </p>
      ) : null}

      {showResults && search.isPending ? (
        <FollowListSkeleton count={3} label="Searching…" />
      ) : null}

      {showResults && search.isError ? (
        <div className="grid gap-4">
          <Alert variant="destructive">
            <CircleAlertIcon aria-hidden="true" />
            <AlertDescription>
              We couldn't search right now. Check your connection and try again.
            </AlertDescription>
          </Alert>
          <Button
            className="justify-self-start"
            onClick={() => void search.refetch()}
            type="button"
            variant="outline"
          >
            <RotateCwIcon aria-hidden="true" data-icon="inline-start" />
            Try again
          </Button>
        </div>
      ) : null}

      {showResults && search.isSuccess && items.length === 0 ? (
        <Empty className="content-enter border">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon aria-hidden="true" />
            </EmptyMedia>
            <EmptyTitle>No people match “{state.text}”.</EmptyTitle>
            <EmptyDescription>
              Check the spelling or try part of a name.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}

      {showResults && search.isSuccess && items.length > 0 ? (
        <ul
          aria-busy={search.isPlaceholderData}
          aria-label="Search results"
          className={`content-enter grid gap-2 transition-opacity ${
            search.isPlaceholderData ? "opacity-60" : ""
          }`}
        >
          {items.map((item) => (
            <li key={item.user.id}>
              <MemberRow item={item} viewerUsername={viewer?.username} />
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
