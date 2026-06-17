import type { Metadata } from "next";

/** 设置页面 Metadata */
export const metadata: Metadata = { title: "设置" };

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
