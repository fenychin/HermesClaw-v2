"use client"

import { type ReactNode } from "react"
import { cn } from "@/lib/utils"

interface PanelContainerProps {
  /** 面板标题 */
  title: string
  /** 标题行图标（lucide-react 组件引用） */
  icon: ReactNode
  /** 面板内容 */
  children: ReactNode
  /** 右上角操作区（如刷新按钮） */
  actions?: ReactNode
  /** 额外 CSS 类名 */
  className?: string
}

/**
 * 右侧面板统一外壳。
 *
 * 提供一致的标题栏、边框、圆角、间距，三个面板共用。
 * 不处理加载/错误/空状态 — 由各面板自行管理。
 */
export function PanelContainer({
  title,
  icon,
  children,
  actions,
  className,
}: PanelContainerProps) {
  return (
    <section
      className={cn(
        "bg-card/45 border border-border backdrop-blur-md rounded-2xl p-4",
        className,
      )}
    >
      {/* 标题行 */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-muted-foreground shrink-0">{icon}</span>
        <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase flex-1">
          {title}
        </span>
        {actions}
      </div>
      {children}
    </section>
  )
}
