import { HomeView } from "../../components/home-view";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Home · Twitter Clone" };

export default function HomePage() {
  return (
    <main>
      <section>
        <HomeView />
      </section>
    </main>
  );
}
