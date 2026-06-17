import type { Metadata } from "next";

/** 智能体中心页面 Metadata */
export const metadata: Metadata = { title: "智能体" };

export default function AgentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
