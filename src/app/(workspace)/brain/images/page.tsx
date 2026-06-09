"use client";

import { ImageIcon } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";

export default function ImagesPage() {
  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <EmptyState
          icon={ImageIcon}
          title="图像资产暂未开放"
          description="图像资产功能正在开发中，敬请期待。"
        />
      </div>
    </PageTransition>
  );
}
