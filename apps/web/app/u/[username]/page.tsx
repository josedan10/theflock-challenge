import { ProfileView } from "../../../components/profile-view";

import type { Metadata } from "next";

export const metadata: Metadata = { title: "Profile · Twitter Clone" };

export default async function ProfilePage({
  params,
}: PageProps<"/u/[username]">) {
  const { username } = await params;
  return (
    <main className="mx-auto min-h-dvh w-full max-w-2xl px-3 py-4 sm:px-6 sm:py-8">
      <ProfileView username={username} />
    </main>
  );
}
