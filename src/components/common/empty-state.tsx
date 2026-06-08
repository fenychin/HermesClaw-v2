import type { LucideIcon } from "lucide-react";
import { Sparkles } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** 可选操作按钮 */
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
    <div className="border-border bg-card flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed p-16 text-center">
      <div className="bg-accent text-brand flex size-12 items-center justify-center rounded-xl">
        <Icon className="size-6" />
      </div>
      <div className="space-y-1">
        <p className="text-foreground text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-hint mx-auto max-w-sm text-xs leading-relaxed">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <button
          type="button"
          onClick={action.onClick}
          className="bg-primary text-primary-foreground hover:bg-primary/80 mt-2 rounded-lg px-4 py-1.5 text-sm font-medium transition-colors"
        >
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
