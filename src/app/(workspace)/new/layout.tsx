import type { Metadata } from "next";

/** 新话题（超级入口）页面 Metadata */
export const metadata: Metadata = { title: "新话题" };

export default function NewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
