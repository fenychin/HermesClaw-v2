import type { Metadata } from "next";

/** 文件中心页面 Metadata */
export const metadata: Metadata = { title: "文件中心" };

export default function FilesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
