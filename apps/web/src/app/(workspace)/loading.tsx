import { SkeletonCard } from "@/components/common/skeleton-card";

export default function WorkspaceLoading() {
  return (
    <div className="flex-1 space-y-4 p-6">
      <SkeletonCard variant="card" />
      <SkeletonCard variant="card" />
      <SkeletonCard variant="card" />
    </div>
  );
}
