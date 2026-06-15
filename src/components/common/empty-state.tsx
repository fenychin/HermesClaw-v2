import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
}

/**
 * 通用空状态占位组件
 * —— 用于尚未实现的模块或无数据场景，居中图标 + 标题 + 描述 + 可选操作
 */
export function EmptyState({
  icon: Icon = Sparkles,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="bg-card rounded-2xl p-4 mb-4">
        <Icon className="size-8 text-muted-foreground" />
      </div>
      <div className="text-foreground font-medium text-sm">{title}</div>
      {description && (
        <p className="text-muted-foreground text-sm mt-1 max-w-xs">
          {description}
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="bg-primary/10 text-primary rounded-xl px-4 py-2 text-sm mt-4 hover:bg-primary/20 transition-colors"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

