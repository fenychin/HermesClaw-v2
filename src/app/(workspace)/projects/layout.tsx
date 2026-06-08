import type { Metadata } from "next";

/** 项目空间页面 Metadata */
export const metadata: Metadata = { title: "项目空间" };

export default function ProjectsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
