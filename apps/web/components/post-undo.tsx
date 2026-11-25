"use client";

import { Undo2Icon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * The countdown line and Undo under a just-posted tweet (AC-B01.6, AC-B01.7).
 *
 * The remaining seconds are text, so the countdown reads without motion; the
 * shrinking bar is decoration and hides under reduced motion. Nothing here
 * is a live region, so screen readers are not told every second; the Undo
 * button's description gives the time left when it is focused. The window
 * ends exactly at `expiresAt` through `onExpire`.
 */
export function PostUndo({
  expiresAt,
  onExpire,
  onUndo,
  pending = false,
}: Readonly<{
  expiresAt: number;
  onExpire: () => void;
  onUndo: () => void;
  pending?: boolean;
}>) {
  const descriptionId = useId();
  const [now, setNow] = useState(() => Date.now());
  // Fixed at mount: changing a running animation's duration makes it jump.
  const [barMs] = useState(() => Math.max(0, expiresAt - Date.now()));
  const expire = useRef(onExpire);

  useEffect(() => {
    expire.current = onExpire;
  }, [onExpire]);

  useEffect(() => {
    const left = expiresAt - Date.now();
    if (left <= 0) {
      expire.current();
      return;
    }
    const tick = setInterval(() => setNow(Date.now()), 250);
    const end = setTimeout(() => expire.current(), left);
    return () => {
      clearInterval(tick);
      clearTimeout(end);
    };
  }, [expiresAt]);

  const remaining = Math.max(0, expiresAt - now);
  const seconds = Math.ceil(remaining / 1000);

  return (
    <div className="grid gap-1.5 rounded-lg bg-muted/60 px-3 py-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground" id={descriptionId}>
          Posted. Undo available for{" "}
          <span className="font-medium text-foreground tabular-nums">
            {seconds}s
          </span>
          <span className="sr-only">
            {" "}
            ({seconds} {seconds === 1 ? "second" : "seconds"} left)
          </span>
        </p>
        <Button
          aria-busy={pending}
          aria-describedby={descriptionId}
          className="min-h-11 sm:min-h-8"
          disabled={pending}
          onClick={onUndo}
          size="sm"
          type="button"
          variant="outline"
        >
          {pending ? (
            <Spinner
              aria-hidden="true"
              aria-label={undefined}
              className="motion-reduce:animate-none"
              data-icon="inline-start"
              role="presentation"
            />
          ) : (
            <Undo2Icon aria-hidden="true" data-icon="inline-start" />
          )}
          Undo
        </Button>
      </div>
      <div
        aria-hidden="true"
        className="h-0.5 overflow-hidden rounded-full bg-border motion-reduce:hidden"
      >
        <div
          className="undo-countdown h-full origin-left bg-primary"
          style={{ animationDuration: `${barMs}ms` }}
        />
      </div>
    </div>
  );
}
