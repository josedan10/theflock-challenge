import type { Metadata } from "next";

import { FollowListView } from "@/components/follow-list-view";

export const metadata: Metadata = { title: "Followers · Twitter Clone" };

export default async function FollowersPage({
  params,
}: PageProps<"/u/[username]/followers">) {
  const { username } = await params;
  return <FollowListView direction="followers" username={username} />;
}
