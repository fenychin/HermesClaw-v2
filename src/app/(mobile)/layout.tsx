import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import { MobileShell } from "@/components/layout/mobile-shell";

/**
 * 移动端路由组 Metadata
 * —— 外勤销售 PWA 执行追踪入口，独立于 workspace AppShell
 */
export const metadata: Metadata = {
  title: {
    default: "移动执行追踪",
    template: `%s | HermesClaw 移动端`,
  },
  description:
    "HermesClaw 外勤销售移动端 PWA — 任务执行追踪、Harness 审批、系统通知",
  robots: { index: false, follow: false },
};

/** 移动端 Viewport：全屏、不可缩放、地址栏适配 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: "#0B0B0C",
  viewportFit: "cover",
};

/**
 * 移动端专属布局
 * —— 不复用 (workspace) 的 AppShell，提供底部 Tab 导航
 * —— 使用 min-h-dvh 替代 min-h-screen 以适配移动端地址栏动态显隐
 *
 * ⚠️ MOBILE PREVIEW — PRD §9.3 暂缓项。
 * 本路由组仅在 NEXT_PUBLIC_ENABLE_MOBILE_PREVIEW=true 时启用，
 * 默认走 notFound()。生产构建避免暴露 fixture 数据驱动的 UI。
 */
export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // 仅在显式开启时进入移动端预览。任何非 "true" 字符串均视为关闭。
  if (process.env.NEXT_PUBLIC_ENABLE_MOBILE_PREVIEW !== "true") {
    notFound();
  }
  return <MobileShell>{children}</MobileShell>;
}
