import type { ReactNode } from "react";

import { Skeleton } from "@/components/ui/skeleton";

/** Pulse is decorative; it stops for people who ask for reduced motion. */
const bone = "motion-reduce:animate-none";

/**
 * One live, busy status region around decorative placeholder shapes. Screen
 * readers hear only `label`; the shapes are hidden from them.
 */
function LoadingRegion({
  children,
  className,
  label,
}: Readonly<{ children: ReactNode; className?: string; label: string }>) {
  return (
    <div aria-busy="true" className={className} role="status">
      <p className="sr-only">{label}</p>
      <div aria-hidden="true" className="contents">
        {children}
      </div>
    </div>
  );
}

/** Same footprint as a tweet card, so content does not jump when it lands. */
function TweetCardSkeleton() {
  return (
    <div className="grid gap-3 rounded-xl border bg-card p-4">
      <div className="flex items-start gap-3">
        <Skeleton className={`size-8 shrink-0 rounded-full ${bone}`} />
        <div className="grid flex-1 gap-2 pt-0.5">
          <Skeleton className={`h-3.5 w-28 ${bone}`} />
          <Skeleton className={`h-3 w-40 ${bone}`} />
        </div>
      </div>
      <div className="grid gap-2">
        <Skeleton className={`h-3.5 w-full ${bone}`} />
        <Skeleton className={`h-3.5 w-4/5 ${bone}`} />
      </div>
    </div>
  );
}

/** Placeholder tweet cards for the first or a further timeline page. */
export function TimelineSkeleton({
  count = 3,
  label,
}: Readonly<{ count?: number; label: string }>) {
  return (
    <LoadingRegion className="grid gap-3" label={label}>
      {Array.from({ length: count }, (_, index) => (
        <TweetCardSkeleton key={index} />
      ))}
    </LoadingRegion>
  );
}

/** The welcome card with its composer, then a timeline, as on /home. */
export function HomeSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <LoadingRegion className="grid gap-6" label={label}>
      <div className="grid gap-4 rounded-xl border bg-card p-6">
        <Skeleton className={`h-7 w-48 ${bone}`} />
        <Skeleton className={`h-3.5 w-20 ${bone}`} />
        <Skeleton className={`h-20 w-full ${bone}`} />
        <Skeleton className={`h-8 w-20 justify-self-end ${bone}`} />
      </div>
      <div className="grid gap-3">
        <Skeleton className={`h-5 w-36 ${bone}`} />
        {Array.from({ length: 3 }, (_, index) => (
          <TweetCardSkeleton key={index} />
        ))}
      </div>
    </LoadingRegion>
  );
}

/** Banner, avatar, name, bio and the three counts of a profile. */
export function ProfileSkeleton({ label }: Readonly<{ label: string }>) {
  return (
    <LoadingRegion
      className="grid overflow-hidden rounded-xl border bg-card"
      label={label}
    >
      <Skeleton className={`h-24 rounded-none sm:h-32 ${bone}`} />
      <div className="grid gap-6 px-6 pb-6">
        <Skeleton
          className={`-mt-12 size-24 rounded-full border-4 border-card sm:-mt-14 sm:size-28 ${bone}`}
        />
        <div className="grid gap-2">
          <Skeleton className={`h-7 w-44 ${bone}`} />
          <Skeleton className={`h-4 w-24 ${bone}`} />
        </div>
        <div className="grid gap-2">
          <Skeleton className={`h-3.5 w-full ${bone}`} />
          <Skeleton className={`h-3.5 w-2/3 ${bone}`} />
        </div>
        <div className="grid grid-cols-3 gap-2 border-t pt-4">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="grid justify-items-center gap-2" key={index}>
              <Skeleton className={`h-6 w-10 ${bone}`} />
              <Skeleton className={`h-3 w-16 ${bone}`} />
            </div>
          ))}
        </div>
      </div>
    </LoadingRegion>
  );
}

/** Member rows: avatar, name, handle and a follow-button-sized block. */
export function FollowListSkeleton({
  count = 4,
  label,
}: Readonly<{ count?: number; label: string }>) {
  return (
    <LoadingRegion className="grid gap-2" label={label}>
      {Array.from({ length: count }, (_, index) => (
        <div
          className="flex items-center gap-2.5 rounded-lg border px-3 py-2.5"
          key={index}
        >
          <Skeleton className={`size-8 shrink-0 rounded-full ${bone}`} />
          <div className="grid flex-1 gap-2">
            <Skeleton className={`h-3.5 w-28 ${bone}`} />
            <Skeleton className={`h-3 w-20 ${bone}`} />
          </div>
          <Skeleton className={`h-11 w-24 ${bone}`} />
        </div>
      ))}
    </LoadingRegion>
  );
}
