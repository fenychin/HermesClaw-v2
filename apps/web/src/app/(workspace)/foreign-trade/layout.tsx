import type { Metadata } from "next";

/** 外贸工作台页面 Metadata */
export const metadata: Metadata = { title: "外贸工作台" };

export default function ForeignTradeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
