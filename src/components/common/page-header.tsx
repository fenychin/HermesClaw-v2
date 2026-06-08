import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

interface PageHeaderProps {
  title: string;
  /** 副标题（原 description，保留别名兼容） */
  subtitle?: string;
  /** @deprecated 使用 subtitle */
  description?: string;
  /** 左侧图标 */
  icon?: LucideIcon;
  /** 右侧操作区（按钮等） */
  actions?: ReactNode;
}

/**
 * 通用页头组件
 * —— 左侧：图标 + 大标题 + 副标题；右侧：操作区；底部 1px 分隔线
 */
export function PageHeader({
  title,
  subtitle,
  description,
  icon: Icon,
  actions,
}: PageHeaderProps) {
  const subtitleText = subtitle ?? description;

  return (
    <div className="border-border mb-6 border-b pb-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className="bg-accent text-brand flex size-9 shrink-0 items-center justify-center rounded-lg">
              <Icon className="size-5" />
            </div>
          ) : null}
          <div className="space-y-1">
            <h1 className="text-foreground text-xl font-semibold tracking-tight">
              {title}
            </h1>
            {subtitleText ? (
              <p className="text-muted-foreground text-sm">{subtitleText}</p>
            ) : null}
          </div>
        </div>
        {actions ? (
          <div className="flex items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </div>
  );
}
