import type { Metadata } from "next";
import KnowledgePageClient from "./page-client";

export const metadata: Metadata = {
  title: "记忆体 — Hermes 知识版本控制面板",
  description: "短/中/长期三级记忆体系、版本溯源、命中统计与知识缺口管理",
};

/**
 * /workspace/knowledge — Hermes Memory 状态面板
 * —— SSR 直出，客户端 hydration 后接管实时交互
 */
export default function KnowledgePage() {
  return <KnowledgePageClient />;
}
