import type { Metadata } from "next";

import { HomeView } from "@/components/home-view";

export const metadata: Metadata = { title: "Home · Twitter Clone" };

export default function HomePage() {
  return <HomeView />;
}
