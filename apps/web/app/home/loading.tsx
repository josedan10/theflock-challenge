import { PageShell } from "@/components/page-shell";
import { PageSkeleton } from "@/components/page-skeleton";

export default function HomeLoading() {
  return (
    <PageShell>
      <PageSkeleton label="Loading your account" />
    </PageShell>
  );
}
