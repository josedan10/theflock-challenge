import type { Metadata } from "next";

import { NotificationsView } from "@/components/notifications-view";

export const metadata: Metadata = { title: "Notifications · Twitter Clone" };

export default function NotificationsPage() {
  return <NotificationsView />;
}
