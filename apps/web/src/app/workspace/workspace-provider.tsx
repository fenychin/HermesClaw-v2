"use client";

import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceOverlays } from "@/components/layout/workspace-overlays";
import { useUser } from "@/hooks/use-user";
import dynamic from "next/dynamic";

const OpenClawStreamBridge =
  process.env.NODE_ENV === "production"
    ? dynamic(
        () => import("@/components/layout/openclaw-stream-bridge").then(m => ({ default: m.OpenClawStreamBridge })),
        { ssr: false }
      )
    : () => null;

export type WorkspaceMode = "session" | "config";

interface WorkspaceContextType {
  mode: WorkspaceMode;
  setMode: (mode: WorkspaceMode) => void;
  /** 当前租户 workspaceId（从服务端 layout 注入） */
  workspaceId: string;
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function useWorkspaceMode() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceMode must be used within a WorkspaceProvider");
  }
  return context;
}

/**
 * 获取当前 workspaceId。
 * —— 由服务端 layout 在构建 WorkspaceProvider 时注入，客户端零 DB 查询。
 */
export function useWorkspaceId(): string {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceId must be used within a WorkspaceProvider");
  }
  return context.workspaceId;
}

export default function WorkspaceProvider({
  children,
  workspaceId,
}: {
  children: ReactNode;
  workspaceId: string;
}) {
  const [mode, setMode] = useState<WorkspaceMode>("session");

  // 同步 workspaceId 到 Zustand useUser store，供所有子组件 select
  const setWorkspaceId = useUser((s) => s.setWorkspaceId);
  useEffect(() => {
    setWorkspaceId(workspaceId);
  }, [workspaceId, setWorkspaceId]);

  return (
    <WorkspaceContext.Provider value={{ mode, setMode, workspaceId }}>
      <div className="bg-background flex h-screen overflow-hidden">
        <OpenClawStreamBridge />
        <Sidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <TopBar />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
        <WorkspaceOverlays />
        <Toaster richColors closeButton position="bottom-right" />
      </div>
    </WorkspaceContext.Provider>
  );
}
