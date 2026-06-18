export * from "./roles";

/**
 * Policy 裁决 —— L1-L4 自动化授权矩阵（CLAUDE.md §2.3 / AGENTS.md §5.2）
 *
 * 工作机制：
 *  1. 从 Workspace.automationLevel 读取当前工作空间的自动化等级（默认 L2）
 *  2. 调用方亦可显式传入 input.automationLevel 覆盖
 *  3. 按 (riskLevel × automationLevel) 矩阵裁决，输出三态：
 *       allowed         → { allowed: true,  requiresApproval: false }
 *       needs confirm   → { allowed: true,  requiresApproval: false, reason: "请确认" }
 *       needs approval  → { allowed: false, requiresApproval: true  }
 *       blocked         → { allowed: false, requiresApproval: false, reason: "..." }
 *
 * 矩阵：
 *   ┌────────────┬─────────┬───────────┬─────────────┬────────────┐
 *   │ riskLevel  │   L1    │    L2     │     L3      │     L4     │
 *   ├────────────┼─────────┼───────────┼─────────────┼────────────┤
 *   │ low        │ allowed │ allowed   │ allowed     │ confirm    │
 *   │ medium     │ allowed │ confirm   │ approval    │ blocked    │
 *   │ high       │ confirm │ approval  │ blocked     │ blocked    │
 *   │ critical   │ approval│ blocked   │ blocked     │ blocked    │
 *   └────────────┴─────────┴───────────┴─────────────┴────────────┘
 */

export type AutomationLevel = "L1" | "L2" | "L3" | "L4";
export type RiskLevel = "low" | "medium" | "high" | "critical";

export interface PolicyCheckInput {
  workspaceId: string;
  action: string;
  riskLevel: RiskLevel;
  /** 显式覆盖工作空间的 automationLevel（未传则从 DB 读取） */
  automationLevel?: AutomationLevel;
}

export interface PolicyCheckResult {
  allowed: boolean;
  requiresApproval: boolean;
  level: AutomationLevel;
  reason?: string;
}

export interface PolicyCheckDeps {
  prisma: any;
}

type Verdict = "allowed" | "confirm" | "approval" | "blocked";

const MATRIX: Record<RiskLevel, Record<AutomationLevel, Verdict>> = {
  low: {
    L1: "allowed",
    L2: "allowed",
    L3: "allowed",
    L4: "confirm",
  },
  medium: {
    L1: "allowed",
    L2: "confirm",
    L3: "approval",
    L4: "blocked",
  },
  high: {
    L1: "confirm",
    L2: "approval",
    L3: "blocked",
    L4: "blocked",
  },
  critical: {
    L1: "approval",
    L2: "blocked",
    L3: "blocked",
    L4: "blocked",
  },
};

const VALID_LEVELS: ReadonlyArray<AutomationLevel> = ["L1", "L2", "L3", "L4"];
const VALID_RISKS: ReadonlyArray<RiskLevel> = [
  "low",
  "medium",
  "high",
  "critical",
];

function isAutomationLevel(x: unknown): x is AutomationLevel {
  return typeof x === "string" && (VALID_LEVELS as ReadonlyArray<string>).includes(x);
}

function isRiskLevel(x: unknown): x is RiskLevel {
  return typeof x === "string" && (VALID_RISKS as ReadonlyArray<string>).includes(x);
}

async function resolveAutomationLevel(
  prisma: any,
  workspaceId: string,
  override?: AutomationLevel,
): Promise<AutomationLevel> {
  if (override && isAutomationLevel(override)) return override;
  try {
    const ws = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { automationLevel: true },
    });
    if (ws?.automationLevel && isAutomationLevel(ws.automationLevel)) {
      return ws.automationLevel;
    }
  } catch {
    /* 表/字段缺失时静默降级到默认 L2 */
  }
  return "L2";
}

function verdictToResult(
  verdict: Verdict,
  level: AutomationLevel,
  action: string,
  riskLevel: RiskLevel,
): PolicyCheckResult {
  switch (verdict) {
    case "allowed":
      return { allowed: true, requiresApproval: false, level };
    case "confirm":
      return {
        allowed: true,
        requiresApproval: false,
        level,
        reason: "请确认",
      };
    case "approval":
      return {
        allowed: false,
        requiresApproval: true,
        level,
        reason: `操作 ${action}（${riskLevel}）在 ${level} 下需要审批`,
      };
    case "blocked":
    default:
      return {
        allowed: false,
        requiresApproval: false,
        level,
        reason: "超出当前自动化等级",
      };
  }
}

export async function checkPolicy(
  input: PolicyCheckInput,
  deps: PolicyCheckDeps,
): Promise<PolicyCheckResult> {
  const riskLevel: RiskLevel = isRiskLevel(input.riskLevel)
    ? input.riskLevel
    : "medium";
  const level = await resolveAutomationLevel(
    deps.prisma,
    input.workspaceId,
    input.automationLevel,
  );

  const verdict = MATRIX[riskLevel][level];
  return verdictToResult(verdict, level, input.action, riskLevel);
}

/** 仅供测试 / 调试使用：暴露纯函数版本，跳过 DB。 */
export function checkPolicySync(
  riskLevel: RiskLevel,
  level: AutomationLevel,
  action = "(unknown)",
): PolicyCheckResult {
  const safeRisk: RiskLevel = isRiskLevel(riskLevel) ? riskLevel : "medium";
  const safeLevel: AutomationLevel = isAutomationLevel(level) ? level : "L2";
  return verdictToResult(MATRIX[safeRisk][safeLevel], safeLevel, action, safeRisk);
}
