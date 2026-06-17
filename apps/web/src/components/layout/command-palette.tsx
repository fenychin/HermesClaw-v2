"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Bot,
  FolderKanban,
  Zap,
  Plus,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useUiStore } from "@/stores/ui-store";
import { useAgentStore } from "@/stores/agent-store";
import { useProjectStore } from "@/stores/project-store";
import { mainNav, bottomNav } from "@/config/navigation";
import { cn } from "@/lib/utils";

/** 页面跳转入口：合并主导航 + 底部导航，共 9 项 */
const allNavItems = [...mainNav, ...bottomNav];

/** 快捷操作定义 */
interface QuickAction {
  id: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

const quickActions: QuickAction[] = [
  {
    id: "create-agent",
    label: "创建智能体",
    description: "新建数字员工",
    icon: Plus,
  },
  {
    id: "create-project",
    label: "新建项目空间",
    description: "创建项目工作单元",
    icon: Plus,
  },
  {
    id: "view-upgrades",
    label: "查看升级提案",
    description: "跳转至 Harness 审批",
    icon: Settings,
  },
];

/**
 * 全局命令面板（Cmd+K / Ctrl+K）
 * —— 使用 cmdk + Dialog 包裹，居中弹出，支持页面跳转、智能体/项目搜索与快捷操作
 */
export function CommandPalette() {
  const router = useRouter();
  const open = useUiStore((s) => s.commandPaletteOpen);
  const setOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const agents = useAgentStore((s) => s.agents);
  const setSelectedAgent = useAgentStore((s) => s.setSelectedAgent);
  const projects = useProjectStore((s) => s.projects);
  const setSelectedProject = useProjectStore((s) => s.setSelectedProject);

  /** 统一关闭面板并执行回调 */
  const runCommand = useCallback(
    (fn: () => void) => {
      setOpen(false);
      // 延迟执行避免关闭动画期间跳转
      requestAnimationFrame(fn);
    },
    [setOpen],
  );

  /** 处理快捷操作 */
  const handleQuickAction = useCallback(
    (id: string) => {
      switch (id) {
        case "create-agent":
          runCommand(() => router.push("/agents"));
          break;
        case "create-project":
          runCommand(() => router.push("/projects"));
          break;
        case "view-upgrades":
          runCommand(() => router.push("/settings"));
          break;
      }
    },
    [router, runCommand],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent
        showCloseButton={false}
        className="max-w-[600px] gap-0 border-border bg-overlay p-0"
      >
        <Command
          className={cn(
            "flex flex-col overflow-hidden rounded-xl",
            // cmdk 根容器覆写
            "[&_[cmdk-root]]:bg-transparent",
          )}
          label="全局命令面板"
        >
          {/* 搜索框 */}
          <div className="border-border flex items-center border-b px-3">
            <Command.Input
              autoFocus
              placeholder="输入命令搜索..."
              className={cn(
                "placeholder:text-hint flex-1 bg-transparent px-1 py-3.5",
                "text-foreground text-sm outline-none",
                "disabled:opacity-50",
              )}
            />
            {/* 快捷键提示 */}
            <kbd className="text-hint hidden shrink-0 items-center gap-0.5 rounded-md border border-border px-1.5 py-0.5 text-[10px] font-medium sm:flex">
              <span className="text-xs">⌘</span>K
            </kbd>
          </div>

          {/* 结果列表 */}
          <Command.List
            className={cn(
              "max-h-[420px] overflow-y-auto overscroll-contain p-2",
              "scroll-py-2",
              // 滚动条样式
              "[&::-webkit-scrollbar]:w-1.5",
              "[&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-thumb]:rounded-full",
            )}
          >
            {/* 空状态 */}
            <Command.Empty className="text-hint py-16 text-center text-sm">
              无匹配结果
            </Command.Empty>

            {/* 页面跳转 */}
            <Command.Group
              heading="页面跳转"
              className={cn(
                // Group 头部
                "[&_[cmdk-group-heading]]:text-hint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide",
              )}
            >
              {allNavItems.map((item) => (
                <Command.Item
                  key={item.href}
                  value={`nav-${item.label}-${item.description ?? ""}`}
                  onSelect={() =>
                    runCommand(() => router.push(item.href))
                  }
                  className={cn(
                    "aria-selected:bg-hover flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                    "text-foreground text-sm transition-colors",
                    "data-[selected=true]:bg-hover",
                  )}
                >
                  <div className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md bg-black/20">
                    <item.icon className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{item.label}</span>
                    {item.description && (
                      <span className="text-hint truncate text-xs">
                        {item.description}
                      </span>
                    )}
                  </div>
                  <span className="text-hint shrink-0 text-[10px]">
                    跳转
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* 智能体搜索 */}
            <Command.Group
              heading="智能体"
              className={cn(
                "[&_[cmdk-group-heading]]:text-hint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide",
              )}
            >
              {agents.map((agent) => (
                <Command.Item
                  key={agent.id}
                  value={`agent-${agent.name}-${agent.role}-${agent.description}`}
                  onSelect={() =>
                    runCommand(() => {
                      setSelectedAgent(agent.id);
                      router.push("/agents");
                    })
                  }
                  className={cn(
                    "aria-selected:bg-hover flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                    "text-foreground text-sm transition-colors",
                    "data-[selected=true]:bg-hover",
                  )}
                >
                  <div className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md bg-black/20">
                    <Bot className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{agent.name}</span>
                    <span className="text-hint truncate text-xs">
                      {agent.role} · {agent.category.join("、")}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      agent.status === "running"
                        ? "bg-success/15 text-success"
                        : agent.status === "error"
                          ? "bg-danger/15 text-danger"
                          : agent.status === "paused"
                            ? "bg-warning/15 text-warning"
                            : "bg-hint/15 text-hint",
                    )}
                  >
                    {agent.status === "running"
                      ? "运行中"
                      : agent.status === "idle"
                        ? "空闲"
                        : agent.status === "error"
                          ? "异常"
                          : agent.status === "paused"
                            ? "暂停"
                            : agent.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* 项目空间搜索 */}
            <Command.Group
              heading="项目空间"
              className={cn(
                "[&_[cmdk-group-heading]]:text-hint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide",
              )}
            >
              {projects.map((project) => (
                <Command.Item
                  key={project.id}
                  value={`project-${project.name}-${project.owner}-${project.relatedClient ?? ""}-${project.country ?? ""}`}
                  onSelect={() =>
                    runCommand(() => {
                      setSelectedProject(project.id);
                      router.push("/projects");
                    })
                  }
                  className={cn(
                    "aria-selected:bg-hover flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                    "text-foreground text-sm transition-colors",
                    "data-[selected=true]:bg-hover",
                  )}
                >
                  <div className="text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-md bg-black/20">
                    <FolderKanban className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {project.name}
                    </span>
                    <span className="text-hint truncate text-xs">
                      {project.owner}
                      {project.country ? ` · ${project.country}` : ""}
                      {project.type ? ` · ${project.type}` : ""}
                    </span>
                  </div>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                      project.status === "active"
                        ? "bg-success/15 text-success"
                        : project.status === "at-risk"
                          ? "bg-danger/15 text-danger"
                          : project.status === "paused"
                            ? "bg-warning/15 text-warning"
                            : "bg-hint/15 text-hint",
                    )}
                  >
                    {project.status === "active"
                      ? "进行中"
                      : project.status === "at-risk"
                        ? "有风险"
                        : project.status === "paused"
                          ? "暂停"
                          : project.status === "completed"
                            ? "已完成"
                            : project.status}
                  </span>
                </Command.Item>
              ))}
            </Command.Group>

            {/* 快捷操作 */}
            <Command.Group
              heading="快捷操作"
              className={cn(
                "[&_[cmdk-group-heading]]:text-hint [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide",
              )}
            >
              {quickActions.map((action) => (
                <Command.Item
                  key={action.id}
                  value={`action-${action.label}-${action.description}`}
                  onSelect={() => handleQuickAction(action.id)}
                  className={cn(
                    "aria-selected:bg-hover flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5",
                    "text-foreground text-sm transition-colors",
                    "data-[selected=true]:bg-hover",
                  )}
                >
                  <div className="text-brand-primary flex size-8 shrink-0 items-center justify-center rounded-md bg-brand-primary/10">
                    <action.icon className="size-4" />
                  </div>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">
                      {action.label}
                    </span>
                    <span className="text-hint truncate text-xs">
                      {action.description}
                    </span>
                  </div>
                  <Zap className="text-brand-primary size-3.5 shrink-0" />
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          {/* 底部操作提示 */}
          <div className="border-border flex items-center gap-4 border-t px-4 py-2">
            <span className="text-hint inline-flex items-center gap-1 text-[10px]">
              <kbd className="rounded border border-border px-1 py-px text-[10px]">
                ↑↓
              </kbd>{" "}
              导航
            </span>
            <span className="text-hint inline-flex items-center gap-1 text-[10px]">
              <kbd className="rounded border border-border px-1 py-px text-[10px]">
                ↵
              </kbd>{" "}
              选择
            </span>
            <span className="text-hint inline-flex items-center gap-1 text-[10px]">
              <kbd className="rounded border border-border px-1 py-px text-[10px]">
                Esc
              </kbd>{" "}
              关闭
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
