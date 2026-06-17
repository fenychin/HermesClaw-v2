import type { ReactNode } from "react";
import Link from "next/link";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}

/**
 * 通用页头组件
 * —— 左侧：面包屑（可选）+ 大标题 + 可选描述；右侧：操作区；无底部边线，采用 mb-6 空白
 */
export function PageHeader({
  title,
  description,
  actions,
  breadcrumb,
}: PageHeaderProps) {
  return (
    <div className="flex items-center justify-between mb-6">
      {/* 左侧 */}
      <div className="flex flex-col">
        {/* 面包屑 */}
        {breadcrumb && breadcrumb.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 select-none">
            {breadcrumb.map((item, idx) => (
              <div key={idx} className="flex items-center gap-1.5">
                {idx > 0 && <span className="text-muted-foreground/50">/</span>}
                {item.href ? (
                  <Link href={item.href} className="hover:text-foreground transition-colors">
                    {item.label}
                  </Link>
                ) : (
                  <span>{item.label}</span>
                )}
              </div>
            ))}
          </div>
        )}
        {/* 标题与描述 */}
        <h1 className="text-foreground text-xl font-semibold tracking-tight">
          {title}
        </h1>
        {description && (
          <p className="text-muted-foreground text-sm mt-0.5">{description}</p>
        )}
      </div>

      {/* 右侧 */}
      {actions && (
        <div className="flex items-center gap-2">{actions}</div>
      )}
    </div>
  );
}

