"use client";

import { Mic } from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { EmptyState } from "@/components/common/empty-state";

export default function VoicePage() {
  return (
    <PageTransition>
      <div className="flex h-[calc(100vh-10rem)] items-center justify-center">
        <EmptyState
          icon={Mic}
          title="语音库暂未开放"
          description="品牌声音与多语种语音资产功能正在开发中，敬请期待。"
        />
      </div>
    </PageTransition>
  );
}
