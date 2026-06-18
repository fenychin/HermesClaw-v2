/**
 * Harness Spec Generator —— LLM 驱动的 Harness Spec 生成器
 *
 * 三域归属：Hermes Control Kernel
 *
 * 设计要点（对齐 CLAUDE.md §2.3 Runtime-First Evolution）：
 * - 通过 deps 注入 prisma / callLlm，便于测试与后续迁移至 packages/hermes-kernel。
 * - 先从 DB 检索工作空间已激活 Skill / Connector / 近期演化痛点作为上下文，
 *   再交由 LLM 生成结构化 Spec，避免凭空虚构能力。
 * - LLM 失败、JSON 非法或字段缺失时一律降级为基于 DB 上下文的兜底 Spec，
 *   保持路由可用性，绝不抛错给上层。
 */
import type { z } from "zod";
import { HarnessSpecGenerateSchema } from "@hermesclaw/event-contracts";

/**
 * 输入类型：在 schema 推导基础上扩展 workspaceId（schema 不含此字段，
 * 由路由层从 WorkspaceContext 注入），保持契约对象不变。
 */
export type HarnessSpecGenerateInput = z.infer<typeof HarnessSpecGenerateSchema> & {
  workspaceId: string;
};

export interface HarnessSpecGenerateResult {
  spec: {
    businessIntent: string;
    industry: string;
    agentRole: string;
    summary: string;
    suggestedActions: string[];
    boundaries: {
      canDo: string[];
      cannotDo: string[];
    };
    recommendedAutomationLevel: "L1" | "L2" | "L3";
    requiredSkills: string[];
    requiredConnectors: string[];
  };
  generatedAt: string;
  version: string;
}

export interface HarnessSpecGenerateDeps {
  prisma: any;
  callLlm: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

// ==============================
// LLM Prompt 模板
// ==============================

const SPEC_SYSTEM_PROMPT = `
你是 HermesClaw 的 Harness Spec 设计专家，专注于 AI 智能体的职责边界设计。
你的任务是根据业务意图、行业背景、智能体角色和已有能力，生成一份精准的 HarnessSpec。

严格输出单个 JSON 对象，不包含任何解释性文字，格式如下：
{
  "businessIntent": "提炼后的业务意图（一句话）",
  "industry": "行业标识符",
  "agentRole": "智能体角色",
  "summary": "智能体职责边界的中文说明（2-3句话，具体且可操作）",
  "suggestedActions": [
    "具体可执行的能力动作1（动词开头，与已有 Skill/Connector 对应）",
    "具体可执行的能力动作2",
    "具体可执行的能力动作3",
    "具体可执行的能力动作4",
    "具体可执行的能力动作5"
  ],
  "boundaries": {
    "canDo": ["明确允许执行的操作1", "操作2"],
    "cannotDo": ["明确禁止执行的操作1（需人工确认的高危操作）"]
  },
  "recommendedAutomationLevel": "L1 | L2 | L3",
  "requiredSkills": ["对应已有 Skill 名称"],
  "requiredConnectors": ["对应已有 Connector 名称"]
}
`.trim();

// ==============================
// JSON 解析工具
// ==============================

/**
 * 从 LLM 输出文本中提取首个 JSON 对象。
 * 容错策略：直接 parse → 代码围栏内 parse → 首尾大括号片段 parse → 返回 null。
 */
function extractJsonObject(text: string): unknown {
  if (!text) return null;
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fallthrough */
    }
  }
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch && fenceMatch[1]) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      /* fallthrough */
    }
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(trimmed.slice(start, end + 1));
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

// ==============================
// 字段规范化工具
// ==============================

const VALID_LEVELS = ["L1", "L2", "L3"] as const;
type AutomationLevel = (typeof VALID_LEVELS)[number];

function normalizeLevel(raw: unknown): AutomationLevel {
  if (typeof raw === "string") {
    const upper = raw.toUpperCase().trim();
    if ((VALID_LEVELS as ReadonlyArray<string>).includes(upper)) {
      return upper as AutomationLevel;
    }
  }
  return "L2";
}

function toStringArray(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((x) => (typeof x === "string" ? x : x == null ? "" : String(x)))
    .filter((s) => s.length > 0);
}

function normalizeBoundaries(raw: unknown): { canDo: string[]; cannotDo: string[] } {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      canDo: toStringArray(obj.canDo),
      cannotDo: toStringArray(obj.cannotDo),
    };
  }
  return { canDo: [], cannotDo: [] };
}

// ==============================
// 主函数
// ==============================

/**
 * 生成 Harness Spec：DB 上下文检索 → LLM 生成 → 解析校验 → 失败兜底。
 */
export async function generateHarnessSpec(
  input: HarnessSpecGenerateInput,
  deps: HarnessSpecGenerateDeps,
): Promise<HarnessSpecGenerateResult> {
  // ---- Step 1: DB 上下文检索 ----
  const skillWhere: Record<string, unknown> = {
    workspaceId: input.workspaceId,
    status: "active",
  };
  if (input.industry) {
    skillWhere.category = { contains: input.industry };
  }

  const [relevantSkills, activeConnectors, recentEvolutionLogs] = await Promise.all([
    deps.prisma.skill.findMany({
      where: skillWhere,
      select: {
        name: true,
        description: true,
        automationLevel: true,
        category: true,
      },
      take: 10,
    }),
    deps.prisma.connector.findMany({
      where: { workspaceId: input.workspaceId, status: "available" },
      select: { name: true, description: true, category: true },
      take: 8,
    }),
    deps.prisma.evolutionLog.findMany({
      where: { workspaceId: input.workspaceId, triggered: true },
      orderBy: { createdAt: "desc" },
      select: { reason: true, reportMd: true },
      take: 3,
    }),
  ]);

  // ---- Step 2: 构造 user prompt ----
  const userPrompt = `
## 业务意图
${input.businessIntent}

## 行业 / 智能体角色
行业: ${input.industry}
角色: ${input.agentRole}

## 工作空间已有能力（请优先引用这些能力，而非虚构）
### 已有技能 (Skills)
${
  relevantSkills.length > 0
    ? relevantSkills
        .map((s: any) => `- ${s.name}（${s.category}）: ${s.description}`)
        .join("\n")
    : "（暂无已激活 Skill，请生成通用建议）"
}

### 已接入连接器 (Connectors)
${
  activeConnectors.length > 0
    ? activeConnectors
        .map((c: any) => `- ${c.name}（${c.category}）: ${c.description}`)
        .join("\n")
    : "（暂无已接入 Connector）"
}

## 近期系统演化痛点（如有，请在 Spec 中加以针对性解决）
${
  recentEvolutionLogs.length > 0
    ? recentEvolutionLogs
        .map((l: any) => {
          const reason = l.reason ?? (l.reportMd ? String(l.reportMd).slice(0, 100) : "");
          return `- ${reason}`;
        })
        .join("\n")
    : "（暂无近期演化记录）"
}

请生成 HarnessSpec JSON 对象。
`.trim();

  // ---- Step 3: LLM 调用 + 解析 ----
  let specData: Record<string, unknown> | null = null;

  try {
    const rawText = await deps.callLlm(SPEC_SYSTEM_PROMPT, userPrompt);
    const parsed = extractJsonObject(rawText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      specData = parsed as Record<string, unknown>;
    }
  } catch (err) {
    // LLM 不可用时静默降级——日志层由调用方处理
    // eslint-disable-next-line no-console
    console.error(
      "[HarnessSpecGenerator] LLM 调用失败，进入兜底分支",
      err instanceof Error ? err.message : err,
    );
  }

  // ---- Step 4: 兜底（LLM 失败 / JSON 非法）----
  if (!specData) {
    specData = {
      businessIntent: input.businessIntent,
      industry: input.industry,
      agentRole: input.agentRole,
      summary: `${input.agentRole} 负责处理 ${input.industry} 行业中与"${input.businessIntent}"相关的任务，具体边界需人工审批确认。`,
      suggestedActions: [
        ...relevantSkills
          .slice(0, 3)
          .map((s: any) => `调用 ${s.name} 执行相关任务`),
        "记录操作日志供 Harness 审计",
        "高风险操作前请求人工确认",
      ],
      boundaries: {
        canDo: relevantSkills.slice(0, 2).map((s: any) => s.name),
        cannotDo: ["直接发起财务支付", "修改系统级配置", "删除历史数据"],
      },
      recommendedAutomationLevel: "L2",
      requiredSkills: relevantSkills.slice(0, 3).map((s: any) => s.name),
      requiredConnectors: activeConnectors.slice(0, 2).map((c: any) => c.name),
    };
  }

  // ---- Step 5: 字段规范化输出 ----
  return {
    spec: {
      businessIntent: String(specData.businessIntent ?? input.businessIntent),
      industry: String(specData.industry ?? input.industry),
      agentRole: String(specData.agentRole ?? input.agentRole),
      summary: String(specData.summary ?? ""),
      suggestedActions: toStringArray(specData.suggestedActions),
      boundaries: normalizeBoundaries(specData.boundaries),
      recommendedAutomationLevel: normalizeLevel(specData.recommendedAutomationLevel),
      requiredSkills: toStringArray(specData.requiredSkills),
      requiredConnectors: toStringArray(specData.requiredConnectors),
    },
    generatedAt: new Date().toISOString(),
    version: "1.0.0",
  };
}
