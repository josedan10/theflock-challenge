import type { Metadata } from "next";

import { UserSearchView } from "@/components/user-search-view";

export const metadata: Metadata = { title: "Search · Twitter Clone" };

/** People search. A shared `?q=` link opens with that search filled in. */
export default async function SearchPage({
  searchParams,
}: PageProps<"/search">) {
  const { q } = await searchParams;
  return <UserSearchView initialQuery={typeof q === "string" ? q : ""} />;
}
