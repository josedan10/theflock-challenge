import { Skeleton } from "@/components/ui/skeleton";

const bone = "motion-reduce:animate-none";

/**
 * Placeholder while a route segment is loading (FND-03): the outline of a
 * card with a title, two fields and a button, the shape of the sign-in and
 * registration pages. Only the label is announced.
 */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      aria-busy="true"
      className="grid gap-4 rounded-xl border bg-card p-6 shadow-xs"
      role="status"
    >
      <p className="sr-only">{label}</p>
      <div aria-hidden="true" className="grid gap-5">
        <div className="grid gap-2">
          <Skeleton className={`h-7 w-1/2 ${bone}`} />
          <Skeleton className={`h-3.5 w-3/4 ${bone}`} />
        </div>
        {Array.from({ length: 2 }, (_, index) => (
          <div className="grid gap-2" key={index}>
            <Skeleton className={`h-3.5 w-20 ${bone}`} />
            <Skeleton className={`h-9 w-full ${bone}`} />
          </div>
        ))}
        <Skeleton className={`h-9 w-full ${bone}`} />
      </div>
    </div>
  );
}
