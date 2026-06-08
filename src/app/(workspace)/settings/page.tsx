"use client";

import { Suspense } from "react";
import { PageTransition } from "@/components/common/PageTransition";
import { SettingsPageClient } from "@/components/pages/settings/settings-page-client";

/**
 * 设置页面
 * —— 平台底座系统入口：企业信息、团队权限、模型路由、连接器授权、品牌、
 *    账单、AGENTS 规则与 Harness 升级审批中心（PRD 10.9）
 */
export default function SettingsPage() {
  return (
    <PageTransition>
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">加载中…</div>}>
        <SettingsPageClient />
      </Suspense>
    </PageTransition>
  );
}
