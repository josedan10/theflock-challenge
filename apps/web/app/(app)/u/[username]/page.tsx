import type { Metadata } from "next";

import { ProfileView } from "@/components/profile-view";

export const metadata: Metadata = { title: "Profile · Twitter Clone" };

export default async function ProfilePage({
  params,
}: PageProps<"/u/[username]">) {
  const { username } = await params;
  return <ProfileView username={username} />;
}
