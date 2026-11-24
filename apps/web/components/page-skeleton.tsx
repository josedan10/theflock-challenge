import { Spinner } from "@/components/ui/spinner";

/** Placeholder while a route segment is loading (FND-03). */
export function PageSkeleton({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      aria-busy="true"
      className="grid gap-4 rounded-xl border bg-card p-6 shadow-xs"
      role="status"
    >
      <p className="sr-only">{label}</p>
      <div className="flex items-center gap-2 text-muted-foreground">
        <Spinner aria-hidden="true" className="motion-reduce:animate-none" />
        <span aria-hidden="true">{label}</span>
      </div>
      <div aria-hidden="true" className="grid gap-2">
        <div className="h-3 w-2/3 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-full animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
        <div className="h-3 w-5/6 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      </div>
    </div>
  );
}
