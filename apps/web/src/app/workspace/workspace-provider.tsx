"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Toaster } from "@/components/ui/sonner";
import { WorkspaceOverlays } from "@/components/layout/workspace-overlays";
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
}

const WorkspaceContext = createContext<WorkspaceContextType | undefined>(undefined);

export function useWorkspaceMode() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspaceMode must be used within a WorkspaceProvider");
  }
  return context;
}

export default function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<WorkspaceMode>("session");

  return (
    <WorkspaceContext.Provider value={{ mode, setMode }}>
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
