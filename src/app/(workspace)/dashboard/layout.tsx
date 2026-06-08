import type { Metadata } from "next";

/** 动态大盘页面 Metadata */
export const metadata: Metadata = { title: "动态大盘" };

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
