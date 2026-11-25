import { FollowListSkeleton } from "@/components/skeletons";

export default function NotificationsLoading() {
  return <FollowListSkeleton count={4} label="Loading notifications…" />;
}
