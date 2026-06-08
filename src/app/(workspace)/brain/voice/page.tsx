"use client";

import { useState } from "react";
import { Mic, Play, Upload, Pause } from "lucide-react";
import { PageHeader } from "@/components/common/page-header";
import { PageTransition } from "@/components/common/PageTransition";
import { cn } from "@/lib/utils";

/** 模拟语音资产数据 */
interface VoiceAsset {
  id: string;
  name: string;
  language: string;
  purpose: string;
  duration: string;
  status: "ready" | "generating";
  previewUrl?: string;
}

const VOICE_DATA: VoiceAsset[] = [
  {
    id: "voice-001",
    name: "品牌声音 · 知性女声",
    language: "中文普通话",
    purpose: "品牌宣传片配音、企业介绍",
    duration: "0:48",
    status: "ready",
  },
  {
    id: "voice-002",
    name: "客服播报 · 温暖男声",
    language: "中文普通话 / 英语",
    purpose: "客服场景自动播报、订单确认",
    duration: "0:32",
    status: "ready",
  },
  {
    id: "voice-003",
    name: "英语外呼 · 商务女声",
    language: "英语（美式）",
    purpose: "海外客户外呼、展会邀请",
    duration: "1:15",
    status: "ready",
  },
];

/** 智慧大脑 → 语音库页 */
export default function VoicePage() {
  const [playingId, setPlayingId] = useState<string | null>(null);

  return (
    <PageTransition>
    <div className="space-y-6">
      <PageHeader
        icon={Mic}
        title="语音库"
        description="品牌声音、外呼模板与多语种语音资产"
        actions={
          <button
            type="button"
            className="bg-brand text-white hover:bg-brand/80 inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-colors"
          >
            <Upload className="size-4" />
            上传语音
          </button>
        }
      />

      {/* 表格 */}
      <div className="bg-card border-border overflow-hidden rounded-2xl border">
        <table className="w-full">
          <thead>
            <tr className="border-border border-b">
              <th className="text-muted-foreground px-5 py-3 text-left text-xs font-medium uppercase tracking-wide">
                名称
              </th>
              <th className="text-muted-foreground px-5 py-3 text-left text-xs font-medium uppercase tracking-wide">
                语种
              </th>
              <th className="text-muted-foreground px-5 py-3 text-left text-xs font-medium uppercase tracking-wide">
                用途
              </th>
              <th className="text-muted-foreground px-5 py-3 text-left text-xs font-medium uppercase tracking-wide">
                试听
              </th>
              <th className="text-muted-foreground px-5 py-3 text-left text-xs font-medium uppercase tracking-wide">
                时长
              </th>
              <th className="text-muted-foreground px-5 py-3 text-left text-xs font-medium uppercase tracking-wide">
                状态
              </th>
              <th className="text-muted-foreground px-5 py-3 text-left text-xs font-medium uppercase tracking-wide">
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {VOICE_DATA.map((voice) => (
              <tr
                key={voice.id}
                className="border-border hover:bg-accent/50 border-b transition-colors last:border-0"
              >
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-2.5">
                    <div className="bg-warning/10 flex size-8 shrink-0 items-center justify-center rounded-lg">
                      <Mic className="text-warning size-4" />
                    </div>
                    <span className="text-foreground text-sm font-medium">
                      {voice.name}
                    </span>
                  </div>
                </td>
                <td className="text-foreground px-5 py-3.5 text-sm">
                  {voice.language}
                </td>
                <td className="text-muted-foreground px-5 py-3.5 text-sm">
                  {voice.purpose}
                </td>
                <td className="px-5 py-3.5">
                  <button
                    type="button"
                    onClick={() =>
                      setPlayingId(playingId === voice.id ? null : voice.id)
                    }
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                      playingId === voice.id
                        ? "bg-brand/10 text-brand"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground"
                    )}
                  >
                    {playingId === voice.id ? (
                      <>
                        <Pause className="size-3.5" />
                        暂停
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5" />
                        试听
                      </>
                    )}
                  </button>
                </td>
                <td className="text-muted-foreground px-5 py-3.5 text-sm font-mono">
                  {voice.duration}
                </td>
                <td className="px-5 py-3.5">
                  <span className="bg-success/10 text-success inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-medium">
                    就绪
                  </span>
                </td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1.5">
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
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  </PageTransition>
  );
}
