import type { Metadata, Viewport } from "next";
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
 */
export default function MobileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <MobileShell>{children}</MobileShell>;
}
