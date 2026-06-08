"use client";

import { Video, Play, Upload } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";

/** 模拟视频资产数据 */
interface VideoAsset {
  id: string;
  title: string;
  duration: string;
  purpose: string;
  status: "ready" | "processing";
  resolution: string;
  size: string;
  color: string;
}

const VIDEO_DATA: VideoAsset[] = [
  {
    id: "vid-001",
    title: "IP65 户外LED投光灯 · 产品展示",
    duration: "3:28",
    purpose: "产品演示",
    status: "ready",
    resolution: "1920×1080",
    size: "156 MB",
    color: "#2D3748",
  },
  {
    id: "vid-002",
    title: "精密五金件 CNC 加工流程",
    duration: "5:12",
    purpose: "工厂实力展示",
    status: "ready",
    resolution: "1920×1080",
    size: "280 MB",
    color: "#4A5568",
  },
  {
    id: "vid-003",
    title: "陶瓷餐具 · 品牌故事",
    duration: "2:05",
    purpose: "品牌宣传",
    status: "processing",
    resolution: "3840×2160",
    size: "420 MB",
    color: "#C8B59B",
  },
  {
    id: "vid-004",
    title: "数字人 · 英语产品口播",
    duration: "1:45",
    purpose: "数字人播报",
    status: "ready",
    resolution: "1920×1080",
    size: "98 MB",
    color: "#553C9A",
  },
];

/** 智慧大脑 → 视频页 */
export default function VideosPage() {
  return (
    <PageTransition>
    <div className="space-y-6">
      <PageHeader
        icon={Video}
        title="视频资产"
        description="产品讲解、演示视频与数字人口播素材库"
        actions={
          <button
            type="button"
            className="bg-brand text-white hover:bg-brand/80 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          >
            <Upload className="size-4" />
            上传视频
          </button>
        }
      />

      {/* 视频列表 */}
      <div className="space-y-3">
        {VIDEO_DATA.map((video) => (
          <div
            key={video.id}
            className="bg-card border-border hover:border-brand/30 flex items-center gap-5 rounded-2xl border p-4 transition-colors"
          >
            {/* 封面占位 */}
            <div
              className="relative flex aspect-video h-20 shrink-0 items-center justify-center rounded-lg"
              style={{ backgroundColor: video.color }}
            >
              <button
                type="button"
                className="bg-white/20 hover:bg-white/30 flex size-10 items-center justify-center rounded-full backdrop-blur-sm transition-colors"
              >
                <Play className="size-5 text-white" />
              </button>
              <span className="absolute bottom-1.5 right-2 text-[10px] font-mono text-white/70">
                {video.duration}
              </span>
            </div>

            {/* 信息 */}
            <div className="min-w-0 flex-1 space-y-1">
              <h3 className="text-foreground truncate text-sm font-semibold">
                {video.title}
              </h3>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-muted-foreground">{video.purpose}</span>
                <span className="text-hint">|</span>
                <span className="text-hint font-mono">{video.duration}</span>
                <span className="text-hint">|</span>
                <span className="text-hint">{video.resolution}</span>
                <span className="text-hint">|</span>
                <span className="text-hint">{video.size}</span>
              </div>
            </div>

            {/* 状态 */}
            <span
              className={cn(
                "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-medium",
                video.status === "ready"
                  ? "bg-success/10 text-success"
                  : "bg-warning/10 text-warning"
              )}
            >
              {video.status === "ready" ? "就绪" : "处理中"}
            </span>

            {/* 操作 */}
            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                className="text-muted-foreground hover:text-foreground hover:bg-accent rounded-md px-2.5 py-1 text-xs transition-colors"
              >
                编辑
              </button>
              <button
                type="button"
                className="text-danger hover:bg-danger/10 rounded-md px-2.5 py-1 text-xs transition-colors"
              >
                删除
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  </PageTransition>
  );
}
