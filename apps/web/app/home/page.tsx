import { HomeView } from "../../components/home-view";
import { PageShell } from "../../components/page-shell";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home · Twitter Clone" };

export default function HomePage() {
  return (
    <PageShell>
      <HomeView />
    </PageShell>
  );
}
