import type { Metadata } from "next";

import { FollowListView } from "@/components/follow-list-view";

export const metadata: Metadata = { title: "Following · Twitter Clone" };

export default async function FollowingPage({
  params,
}: PageProps<"/u/[username]/following">) {
  const { username } = await params;
  return <FollowListView direction="following" username={username} />;
}
