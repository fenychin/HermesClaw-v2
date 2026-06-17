/**
 * Harness Spec Generator —— AI 生成 Harness Spec 占位实现
 *
 * 本模块为 v3.19 重构期临时占位（详见 TECH_DEBT.md），
 * 提供与原 API 兼容的最小可用实现，确保路由可编译；
 * 真实的 Spec 生成器将在 Hermes Kernel 域内重写。
 */
import type { z } from "zod";
import { HarnessSpecGenerateSchema } from "@hermesclaw/event-contracts";

export type HarnessSpecGenerateInput = z.infer<typeof HarnessSpecGenerateSchema>;

export interface HarnessSpecGenerateResult {
  spec: {
    businessIntent: string;
    industry: string;
    agentRole: string;
    summary: string;
    suggestedActions: string[];
  };
  generatedAt: string;
  version: string;
}

/**
 * 占位实现：基于输入回显 + 通用建议结构。
 * 真实实现将由 Hermes Kernel 接管（含 LLM 路由、知识检索、风险评估）。
 */
export async function generateHarnessSpec(
  input: HarnessSpecGenerateInput,
): Promise<HarnessSpecGenerateResult> {
  return {
    spec: {
      businessIntent: input.businessIntent,
      industry: input.industry,
      agentRole: input.agentRole,
      summary: `占位 Spec：${input.industry} 行业 / ${input.agentRole} 角色`,
      suggestedActions: [
        "基于 industryId 加载行业包知识",
        "依据 agentRole 选定默认边界",
        "由人工审批确认 Spec 投产",
      ],
    },
    generatedAt: new Date().toISOString(),
    version: "0.1.0-placeholder",
  };
}
