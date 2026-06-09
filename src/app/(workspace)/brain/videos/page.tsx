"use client";

import { Video } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";

export default function VideosPage() {
  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <EmptyState
          icon={Video}
          title="视频资产暂未开放"
          description="视频资产功能正在开发中，敬请期待。"
        />
      </div>
    </PageTransition>
  );
}
