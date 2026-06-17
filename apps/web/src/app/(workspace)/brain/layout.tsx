import type { Metadata } from "next";
import type { ReactNode } from "react";
import { BrainSubnav } from "@/components/layout/brain-subnav";

/** 智慧大脑页面 Metadata */
export const metadata: Metadata = { title: "智慧大脑" };

/** 智慧大脑外壳：统一二级导航，各页面自行管理页头 */
export default function BrainLayout({ children }: { children: ReactNode }) {
  return (
    <div className="space-y-6 p-6">
      <BrainSubnav />
      {children}
    </div>
  );
}
