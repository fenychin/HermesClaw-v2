/**
 * Harness 评估引擎 —— Hermes Control Kernel 内核演化层
 *
 * 三域归属：Hermes Control Kernel
 *
 * 设计要点（对齐 CLAUDE.md §2.3 Runtime-First Evolution）：
 * - 信号采集只读取标准化日志表（AgentLog / WorkflowRun / AuditLog 等），
 *   不直接耦合任何行业包业务逻辑。
 * - LLM 为唯一的提案生成入口；调用方通过 deps.callLlm 注入上游路由策略。
 * - 输出 EvaluationResult[] 可直接喂给 generateHarnessProposals() 写入 DB。
 */

// ==============================
// 公共类型
// ==============================

export type SignalType =
  | "workflow_failure"
  | "connector_error"
  | "human_correction"
  | "memory_miss"
  | "kpi_drift";

export interface EvaluationSignal {
  type: SignalType;
  agentId?: string;
  count: number;
  detail: string;
}

export type EvaluationSeverity = "low" | "medium" | "high" | "critical";

export type ProposalType =
  | "skill_binding"
  | "workflow_template"
  | "memory_policy"
  | "connector_policy"
  | "eval_rule";

export interface EvaluationResult {
  signal: EvaluationSignal;
  severity: EvaluationSeverity;
  suggestion: string;
  proposalType: ProposalType;
}

export interface RunHarnessEvaluationInput {
  workspaceId: string;
  windowHours?: number;
}

export interface RunHarnessEvaluationDeps {
  prisma: any;
  callLlm: (systemPrompt: string, userPrompt: string) => Promise<string>;
}

// ==============================
// Severity / ProposalType 校验工具
// ==============================

const SEVERITIES: ReadonlyArray<EvaluationSeverity> = [
  "low",
  "medium",
  "high",
  "critical",
];
const PROPOSAL_TYPES: ReadonlyArray<ProposalType> = [
  "skill_binding",
  "workflow_template",
  "memory_policy",
  "connector_policy",
  "eval_rule",
];
const SIGNAL_TYPES: ReadonlyArray<SignalType> = [
  "workflow_failure",
  "connector_error",
  "human_correction",
  "memory_miss",
  "kpi_drift",
];

function isSeverity(x: unknown): x is EvaluationSeverity {
  return typeof x === "string" && (SEVERITIES as ReadonlyArray<string>).includes(x);
}

function isProposalType(x: unknown): x is ProposalType {
  return (
    typeof x === "string" && (PROPOSAL_TYPES as ReadonlyArray<string>).includes(x)
  );
}

function isSignalType(x: unknown): x is SignalType {
  return typeof x === "string" && (SIGNAL_TYPES as ReadonlyArray<string>).includes(x);
}

/** signal.type → 默认 proposalType 映射（LLM 输出非法时兜底用） */
function defaultProposalTypeFor(signal: SignalType): ProposalType {
  switch (signal) {
    case "workflow_failure":
      return "workflow_template";
    case "connector_error":
      return "connector_policy";
    case "memory_miss":
      return "memory_policy";
    case "kpi_drift":
      return "eval_rule";
    case "human_correction":
    default:
      return "skill_binding";
  }
}

// ==============================
// 信号采集（DB 真实查询）
// ==============================

interface RawSignals {
  windowHours: number;
  windowStart: string;
  agentErrors: Array<{ agentId: string | null; count: number; sample?: string }>;
  workflowFailures: { count: number; sample?: string };
  connectorErrors: { count: number; sample?: string };
  humanCorrections: { count: number; sample?: string };
  memoryMisses: { count: number; sample?: string };
}

async function collectSignals(
  prisma: any,
  workspaceId: string,
  windowHours: number,
): Promise<RawSignals> {
  const since = new Date(Date.now() - windowHours * 3600_000);

  // —— AgentLog：status='error'，按 agentId 分组计数
  let agentErrors: RawSignals["agentErrors"] = [];
  try {
    const grouped = await prisma.agentLog.groupBy({
      by: ["agentId"],
      where: { workspaceId, status: "error", createdAt: { gte: since } },
      _count: { _all: true },
    });
    agentErrors = (grouped ?? []).map((g: any) => ({
      agentId: g.agentId ?? null,
      count: g._count?._all ?? 0,
    }));
    // 抽 1 条 detail 作为样例（首个 agent 即可）
    if (agentErrors.length > 0) {
      const sample = await prisma.agentLog.findFirst({
        where: {
          workspaceId,
          status: "error",
          createdAt: { gte: since },
          agentId: agentErrors[0].agentId ?? undefined,
        },
        orderBy: { createdAt: "desc" },
        select: { detail: true, taskName: true },
      });
      if (sample) {
        agentErrors[0].sample = sample.detail || sample.taskName || undefined;
      }
    }
  } catch {
    /* 表/字段缺失时静默降级为空集 */
  }

  // —— WorkflowRun：status='failed'
  let workflowFailures: RawSignals["workflowFailures"] = { count: 0 };
  try {
    const wfCount = await prisma.workflowRun.count({
      where: { workspaceId, status: "failed", createdAt: { gte: since } },
    });
    workflowFailures.count = wfCount;
    if (wfCount > 0) {
      const wfSample = await prisma.workflowRun.findFirst({
        where: { workspaceId, status: "failed", createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
        select: { errorMessage: true, error: true, workflowId: true },
      });
      if (wfSample) {
        workflowFailures.sample =
          wfSample.errorMessage || wfSample.error || wfSample.workflowId;
      }
    }
  } catch {
    /* ignore */
  }

  // —— ConnectorLog（如表存在）：success=false
  let connectorErrors: RawSignals["connectorErrors"] = { count: 0 };
  try {
    if (prisma.connectorLog && typeof prisma.connectorLog.count === "function") {
      connectorErrors.count = await prisma.connectorLog.count({
        where: { workspaceId, success: false, createdAt: { gte: since } },
      });
    }
  } catch {
    /* ignore */
  }

  // —— Human Correction：优先用 AuditLog 中的纠错事件；
  // 字段约定：action 含 'correction' / 'override'。表/字段缺失时降级为 0。
  let humanCorrections: RawSignals["humanCorrections"] = { count: 0 };
  try {
    if (prisma.auditLog && typeof prisma.auditLog.count === "function") {
      humanCorrections.count = await prisma.auditLog.count({
        where: {
          workspaceId,
          createdAt: { gte: since },
          OR: [
            { action: { contains: "correction" } },
            { action: { contains: "override" } },
          ],
        },
      });
    }
  } catch {
    /* ignore */
  }

  // —— Memory Miss：可选字段 humanCorrectionCount / 或 AuditLog.action 含 'memory.miss'
  let memoryMisses: RawSignals["memoryMisses"] = { count: 0 };
  try {
    if (prisma.auditLog && typeof prisma.auditLog.count === "function") {
      memoryMisses.count = await prisma.auditLog.count({
        where: {
          workspaceId,
          createdAt: { gte: since },
          action: { contains: "memory.miss" },
        },
      });
    }
  } catch {
    /* ignore */
  }

  return {
    windowHours,
    windowStart: since.toISOString(),
    agentErrors,
    workflowFailures,
    connectorErrors,
    humanCorrections,
    memoryMisses,
  };
}

// ==============================
// LLM 输出解析
// ==============================

/**
 * 从 LLM 文本输出中提取首个 JSON 数组。
 * 兼容三种常见包裹形式：
 *  1. 纯 JSON 数组
 *  2. ```json ... ``` 代码块
 *  3. 数组前后包含解释性文本
 */
function extractJsonArray(text: string): unknown {
  if (!text) return null;
  const trimmed = text.trim();

  // 直接 JSON
  if (trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch {
      /* fallthrough */
    }
  }

  // 代码块
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    try {
      return JSON.parse(fenceMatch[1]);
    } catch {
      /* fallthrough */
    }
  }

  // 兜底：截取首个 `[` 到末尾匹配的 `]`
  const start = trimmed.indexOf("[");
  const end = trimmed.lastIndexOf("]");
  if (start >= 0 && end > start) {
    const slice = trimmed.slice(start, end + 1);
    try {
      return JSON.parse(slice);
    } catch {
      /* fallthrough */
    }
  }
  return null;
}

interface ParsedLlmItem {
  signal_type?: unknown;
  type?: unknown;
  severity?: unknown;
  suggestion?: unknown;
  proposalType?: unknown;
  proposal_type?: unknown;
  agentId?: unknown;
  agent_id?: unknown;
  count?: unknown;
  detail?: unknown;
}

function buildSignalFromRaw(
  signals: RawSignals,
): Map<SignalType, EvaluationSignal[]> {
  // 把原始信号按 SignalType 归一为 EvaluationSignal[] 备用
  const map = new Map<SignalType, EvaluationSignal[]>();

  for (const ag of signals.agentErrors) {
    if (ag.count <= 0) continue;
    const arr = map.get("workflow_failure") ?? [];
    arr.push({
      type: "workflow_failure",
      agentId: ag.agentId ?? undefined,
      count: ag.count,
      detail:
        ag.sample ?? `Agent ${ag.agentId ?? "(unknown)"} 有 ${ag.count} 次错误`,
    });
    map.set("workflow_failure", arr);
  }

  if (signals.workflowFailures.count > 0) {
    const arr = map.get("workflow_failure") ?? [];
    arr.push({
      type: "workflow_failure",
      count: signals.workflowFailures.count,
      detail:
        signals.workflowFailures.sample ??
        `${signals.workflowFailures.count} 个 WorkflowRun 失败`,
    });
    map.set("workflow_failure", arr);
  }

  if (signals.connectorErrors.count > 0) {
    map.set("connector_error", [
      {
        type: "connector_error",
        count: signals.connectorErrors.count,
        detail:
          signals.connectorErrors.sample ??
          `Connector 调用失败 ${signals.connectorErrors.count} 次`,
      },
    ]);
  }

  if (signals.humanCorrections.count > 0) {
    map.set("human_correction", [
      {
        type: "human_correction",
        count: signals.humanCorrections.count,
        detail:
          signals.humanCorrections.sample ??
          `检测到 ${signals.humanCorrections.count} 次人工纠错`,
      },
    ]);
  }

  if (signals.memoryMisses.count > 0) {
    map.set("memory_miss", [
      {
        type: "memory_miss",
        count: signals.memoryMisses.count,
        detail:
          signals.memoryMisses.sample ??
          `Memory miss 共 ${signals.memoryMisses.count} 次`,
      },
    ]);
  }

  return map;
}

function normalizeLlmItem(
  item: ParsedLlmItem,
  signalIndex: Map<SignalType, EvaluationSignal[]>,
): EvaluationResult | null {
  const rawType = (item.signal_type ?? item.type) as unknown;
  const signalType = isSignalType(rawType) ? rawType : null;
  if (!signalType) return null;

  const severity = isSeverity(item.severity) ? item.severity : "medium";
  const proposalType =
    isProposalType(item.proposalType) || isProposalType(item.proposal_type)
      ? ((item.proposalType ?? item.proposal_type) as ProposalType)
      : defaultProposalTypeFor(signalType);

  // 优先用真实 DB 信号，再退化为 LLM 自带字段
  const reservoir = signalIndex.get(signalType) ?? [];
  const fallbackAgentId =
    typeof item.agentId === "string"
      ? item.agentId
      : typeof item.agent_id === "string"
        ? item.agent_id
        : undefined;
  const matched =
    reservoir.find(
      (s) => fallbackAgentId == null || s.agentId === fallbackAgentId,
    ) ?? reservoir[0];
  const signal: EvaluationSignal = matched ?? {
    type: signalType,
    agentId: fallbackAgentId,
    count: typeof item.count === "number" ? item.count : 1,
    detail: typeof item.detail === "string" ? item.detail : "",
  };

  const suggestion =
    typeof item.suggestion === "string" && item.suggestion.trim().length > 0
      ? item.suggestion.trim()
      : `请关注 ${signalType} 信号`;

  return { signal, severity, suggestion, proposalType };
}

// ==============================
// 主入口：runHarnessEvaluation
// ==============================

const SYSTEM_PROMPT = [
  "你是 HermesClaw 的 Harness 自演化评估器。",
  "输入是过去若干小时内系统的运行信号摘要，",
  "你需要识别需要优化的模式并对每个问题给出具体的中文改进建议。",
  "严格输出 JSON 数组，不要包含解释性文字。",
  "每项字段：",
  '  signal_type: "workflow_failure" | "connector_error" | "human_correction" | "memory_miss" | "kpi_drift",',
  '  severity: "low" | "medium" | "high" | "critical",',
  "  suggestion: 中文改进建议（一句话即可）,",
  '  proposalType: "skill_binding" | "workflow_template" | "memory_policy" | "connector_policy" | "eval_rule"',
].join("\n");

export async function runHarnessEvaluation(
  input: RunHarnessEvaluationInput,
  deps: RunHarnessEvaluationDeps,
): Promise<{ results: EvaluationResult[]; anomalies: number }> {
  const windowHours = input.windowHours ?? 24;

  // 1. 真实 DB 查询信号
  const signals = await collectSignals(deps.prisma, input.workspaceId, windowHours);

  const totalRaw =
    signals.agentErrors.reduce((acc, x) => acc + x.count, 0) +
    signals.workflowFailures.count +
    signals.connectorErrors.count +
    signals.humanCorrections.count +
    signals.memoryMisses.count;

  // 无信号时直接返回空结果，避免空调 LLM
  if (totalRaw === 0) {
    return { results: [], anomalies: 0 };
  }

  // 2. 拼接 LLM userPrompt
  const userPrompt = [
    `分析以下过去 ${windowHours} 小时的 HermesClaw 系统运行信号，`,
    "识别需要优化的模式，对每个问题给出具体的改进建议。",
    `信号数据：${JSON.stringify(signals)}`,
    "",
    '输出 JSON 数组，每项包含：signal_type, severity(low/medium/high/critical),',
    "suggestion(中文), proposalType",
  ].join("\n");

  // 3. 调用 LLM
  let rawText = "";
  try {
    rawText = await deps.callLlm(SYSTEM_PROMPT, userPrompt);
  } catch (err) {
    // LLM 调用失败时，按原始信号兜底生成 medium 提案，避免无声丢失
    return synthesizeFallback(signals);
  }

  const parsed = extractJsonArray(rawText);
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return synthesizeFallback(signals);
  }

  // 4. 解析 + 兜底
  const signalIndex = buildSignalFromRaw(signals);
  const results: EvaluationResult[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") continue;
    const norm = normalizeLlmItem(item as ParsedLlmItem, signalIndex);
    if (norm) results.push(norm);
  }

  // 若 LLM 全部解析失败，退回到原始信号兜底
  if (results.length === 0) {
    return synthesizeFallback(signals);
  }

  const anomalies = results.filter(
    (r) => r.severity === "high" || r.severity === "critical",
  ).length;

  return { results, anomalies };
}

/** LLM 不可用 / 解析失败时，根据原始信号生成保守的 medium 提案集。 */
function synthesizeFallback(
  signals: RawSignals,
): { results: EvaluationResult[]; anomalies: number } {
  const map = buildSignalFromRaw(signals);
  const results: EvaluationResult[] = [];
  for (const [type, arr] of map) {
    for (const sig of arr) {
      results.push({
        signal: sig,
        severity: sig.count >= 5 ? "high" : "medium",
        suggestion: `检测到 ${type} 信号 ${sig.count} 次，建议人工复核并调整对应策略`,
        proposalType: defaultProposalTypeFor(type),
      });
    }
  }
  const anomalies = results.filter(
    (r) => r.severity === "high" || r.severity === "critical",
  ).length;
  return { results, anomalies };
}

// ==============================
// getHarnessStatus（保留旧导出，向后兼容）
// ==============================

export async function getHarnessStatus(
  prisma: any,
  workspaceId: string,
  evalWindowHours: number,
) {
  const [latest, pendingCount, totalProposals] = await Promise.all([
    prisma.harnessProposal.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.harnessProposal.count({ where: { status: "pending", workspaceId } }),
    prisma.harnessProposal.count({ where: { workspaceId } }),
  ]);

  const lastEvaluatedAt = latest?.createdAt.toISOString() ?? null;
  const nextEvaluatedAt = latest
    ? new Date(
        latest.createdAt.getTime() + evalWindowHours * 60 * 60 * 1000,
      ).toISOString()
    : null;

  return {
    lastEvaluatedAt,
    nextEvaluatedAt,
    pendingCount,
    totalProposals,
    intervalHours: evalWindowHours,
  };
}

// Proposal Writer
export { writeProposalsFromEvaluation } from './proposal-writer'
export type { WriteProposalsParams } from './proposal-writer'
