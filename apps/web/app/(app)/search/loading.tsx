import { FollowListSkeleton } from "@/components/skeletons";

export default function SearchLoading() {
  return <FollowListSkeleton count={3} label="Loading search…" />;
}
