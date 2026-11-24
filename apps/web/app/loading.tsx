import { PageShell } from "@/components/page-shell";
import { PageSkeleton } from "@/components/page-skeleton";

export default function RootLoading() {
  return (
    <PageShell>
      <PageSkeleton label="Loading the page" />
    </PageShell>
  );
}
