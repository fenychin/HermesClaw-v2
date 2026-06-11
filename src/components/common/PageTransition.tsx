import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * 页面切换过渡动画组件
 * —— 淡入 + 轻微上移，提供柔和的页面切换体验
 * —— 用 tw-animate-css 的纯 CSS 动画（合成器驱动），不引入 framer-motion，
 *    避免每次导航在主线程跑 JS 动画，并减轻每条路由的编译/打包体积
 */
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "h-full animate-in fade-in-0 slide-in-from-bottom-2 duration-300 ease-out",
        className,
      )}
    >
      {children}
    </div>
  );
}
