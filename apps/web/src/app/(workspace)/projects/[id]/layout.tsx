import type { ReactNode } from "react";

interface ProjectDetailLayoutProps {
  children: ReactNode;
}

/**
 * 项目空间详情页共享布局
 * —— 提供 overflow-hidden h-full 限制，防止三栏布局被外层 padding 或滚动条干扰
 * —— 不包含 AppShell 二次包裹，因为外层 layout 已经包裹过
 */
export default function ProjectDetailLayout({ children }: ProjectDetailLayoutProps) {
  return <div className="overflow-hidden h-full w-full">{children}</div>;
}
