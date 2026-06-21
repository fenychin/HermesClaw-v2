"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Brain, Database, LineChart, FileJson, Puzzle, Plug, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

const brainNavItems = [
  { href: "/brain/memory", label: "记忆库", icon: Database },
  { href: "/brain/knowledge", label: "知识库", icon: FileJson },
  { href: "/brain/kpi", label: "KPI指标", icon: LineChart },
  { href: "/brain/skills", label: "技能库", icon: Puzzle },
  { href: "/brain/connectors", label: "连接器", icon: Plug },
];

export function BrainSidebar() {
  const pathname = usePathname();

  return (
    <aside className="bg-sidebar border-sidebar-border border-r w-[220px] h-full flex flex-col shrink-0 overflow-hidden select-none">
      {/* 头部 */}
      <div className="flex h-14 items-center px-4 shrink-0 border-b border-sidebar-border">
        <span className="text-foreground font-semibold text-sm flex items-center gap-2">
          <Brain className="size-4 text-[#6D5EF9]" />
          智慧大脑中枢
        </span>
      </div>

      {/* 导航菜单 */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {brainNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-lg px-3 py-2.5 text-xs font-medium transition-all duration-150",
                isActive
                  ? "bg-accent text-foreground font-semibold"
                  : "text-muted-foreground hover:bg-accent/40 hover:text-foreground"
              )}
            >
              <Icon className={cn("size-4 transition-transform group-hover:scale-105", isActive ? "text-[#6D5EF9]" : "text-muted-foreground")} />
              <span>{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {/* 底部返回工作台 */}
      <div className="mt-auto p-4 border-t border-sidebar-border shrink-0">
        <Link
          href="/workspace/chat"
          className="w-full h-9 bg-accent/60 text-foreground border border-border hover:bg-accent transition-all rounded-[10px] text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <ChevronLeft className="size-4 text-muted-foreground" />
          <span>返回工作台</span>
        </Link>
      </div>
    </aside>
  );
}
