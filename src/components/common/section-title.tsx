import type { ReactNode } from "react";

interface SectionTitleProps {
  title: string;
  subtitle?: string;
  /** 右侧可选操作区 */
  action?: ReactNode;
}

/**
 * 区块小标题
 * —— 用于页面内部各区块的分隔与命名，左侧标题+副标题，右侧可选操作
 */
export function SectionTitle({ title, subtitle, action }: SectionTitleProps) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-foreground text-sm font-semibold">{title}</h3>
        {subtitle ? (
          <p className="text-hint mt-0.5 text-xs">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
