"use client";

import { PageTransition } from "@/components/common/PageTransition";
import { ProjectChat } from "./_components/project-chat";
import { ProjectContextPanel } from "./_components/project-context-panel";

// ============================================================
// 项目空间详情页
// —— 中栏对话复用 CommandBox + useChat + ConversationArea（与 /new 一致）
// —— 左栏会话历史与右栏配置面板保留布局框架
// ============================================================

export default function ProjectDetailPage() {
  return (
    <PageTransition>
      {/* 顶层容器，全屏自适应 */}
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">

        {/* ======================================================== */}
        {/* 左栏：会话历史列表 (240px) — 后续接入真实 API           */}
        {/* ======================================================== */}
        <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-sidebar flex-col h-full select-none">
          <div className="flex-1 flex items-center justify-center p-4">
            <p className="text-hint text-xs text-center leading-relaxed">
              会话历史功能<br />后续版本接入
            </p>
          </div>
        </aside>

        {/* ======================================================== */}
        {/* 中栏：项目对话主区 (flex-1) — 与 /new 完全一致          */}
        {/* ======================================================== */}
        <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
          <ProjectChat />
        </main>

        {/* ======================================================== */}
        {/* 右栏：项目配置面板 (320px)                              */}
        {/* ======================================================== */}
        <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
          <ProjectContextPanel />
        </aside>

      </div>
    </PageTransition>
  );
}
