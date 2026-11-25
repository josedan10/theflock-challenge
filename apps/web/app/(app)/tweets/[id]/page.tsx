import type { Metadata } from "next";

import { ThreadView } from "@/components/thread-view";

export const metadata: Metadata = { title: "Thread · Twitter Clone" };

export default async function ThreadPage({
  params,
}: PageProps<"/tweets/[id]">) {
  const { id } = await params;
  return <ThreadView key={id} id={id} />;
}
