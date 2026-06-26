import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/layout/sidebar";
import { TopBar } from "@/components/layout/TopBar";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: "智慧大脑中枢 - HermesClaw",
  description: "企业级自演化记忆、知识、技能与 KPI 治理控制中心",
};

export default function BrainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-background flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
      <Toaster richColors closeButton position="bottom-right" />
    </div>
  );
}
