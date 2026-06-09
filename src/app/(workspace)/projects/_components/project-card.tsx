"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import type { MockProject } from "../_data/mock-projects";
import { ProjectSettingsDialog } from "./project-settings-dialog";

interface ProjectCardProps {
  project: MockProject;
  onUpdate: (id: string, updated: Partial<MockProject>) => void;
  onDelete: (id: string) => void;
  className?: string;
}

/**
 * 格式化最近更新时间为相对时间
 */
function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "刚刚";
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  const weeks = Math.floor(days / 7);
  return `${weeks} 周前`;
}

/**
 * 获取项目状态的 Badge 组件
 */
function getStatusBadge(status: MockProject["status"]) {
  switch (status) {
    case "processing":
      return (
        <span className="bg-success/10 text-success text-xs px-2.5 py-0.5 rounded-full font-medium select-none">
          进行中
        </span>
      );
    case "completed":
      return (
        <span className="bg-accent text-muted-foreground text-xs px-2.5 py-0.5 rounded-full font-medium select-none">
          已完成
        </span>
      );
    case "on-hold":
      return (
        <span className="bg-warning/10 text-warning text-xs px-2.5 py-0.5 rounded-full font-medium select-none">
          搁置
        </span>
      );
    default:
      return null;
  }
}

/**
 * ProjectCard 组件
 * 在右下角追加“空间设置”按钮，点击时阻止路由跳转并调出 ProjectSettingsDialog 面板
 */
export function ProjectCard({
  project,
  onUpdate,
  onDelete,
  className,
}: ProjectCardProps) {
  const router = useRouter();
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleNavigate = () => {
    router.push(`/projects/${project.id}`);
  };

  return (
    <>
      <div
        onClick={handleNavigate}
        className={cn(
          "bg-card rounded-card border border-border p-5 hover:border-primary/40 transition-all cursor-pointer flex flex-col justify-between min-h-[160px] group",
          className
        )}
      >
        {/* 顶部：项目名称 + 右上角状态 Badge */}
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-foreground font-medium text-base group-hover:text-primary transition-colors line-clamp-1">
            {project.name}
          </h3>
          <div className="shrink-0">{getStatusBadge(project.status)}</div>
        </div>

        {/* 中部：一行项目描述 */}
        <p className="text-muted-foreground text-sm line-clamp-2 mt-3 mb-4 flex-1">
          {project.description}
        </p>

        {/* 底部 flex justify-between */}
        <div className="flex items-center justify-between pt-1 border-t border-border/50">
          {/* 左侧智能体头像组（最多3个，圆形，16px，叠加排列） */}
          <div className="flex items-center gap-1.5">
            {project.agents.length > 0 ? (
              <div className="flex -space-x-1">
                {project.agents.slice(0, 3).map((agent) => (
                  <div
                    key={agent.id}
                    className={cn(
                      "flex size-4 items-center justify-center rounded-full text-[8px] font-bold ring-1 ring-card select-none",
                      agent.avatarColor
                    )}
                    title={agent.name}
                  >
                    {agent.name.charAt(0)}
                  </div>
                ))}
              </div>
            ) : (
              <span className="text-hint text-[10px]">无关联智能体</span>
            )}
            {project.agents.length > 3 && (
              <span className="text-hint text-[10px]">
                +{project.agents.length - 3}
              </span>
            )}
          </div>

          {/* 右侧：相对更新时间 + 空间设置齿轮按钮 */}
          <div className="flex items-center gap-2">
            <span className="text-hint text-xs font-light">
              {formatRelativeTime(project.updatedAt)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation(); // 阻止路由跳转
                setSettingsOpen(true);
              }}
              type="button"
              className="text-hint hover:text-primary p-1 hover:bg-accent rounded-lg transition-colors shrink-0"
              title="项目设置"
            >
              <Settings className="size-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* 空间设置 Dialog */}
      <ProjectSettingsDialog
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        project={project}
        onUpdate={(updatedFields) => onUpdate(project.id, updatedFields)}
        onDelete={onDelete}
      />
    </>
  );
}
