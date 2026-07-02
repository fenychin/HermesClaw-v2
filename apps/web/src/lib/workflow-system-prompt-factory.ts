/**
 * 工作流 System Prompt 工厂
 *
 * 职责：
 * - 根据 workflowId + industryPackId + contextPayload 生成高质量 systemPrompt
 * - 输出标准达到"专业工作流编排"等级，超单智能体能力
 *
 * 使用方：
 * - useWorkflowChatBridge（Hook 侧 — 跳转前注入 useUiStore）
 * - /api/chat（服务端 — 作为 systemPrompt fallback/enrich 依据）
 *
 * 架构约束（CLAUDE.md §2.2 Contract-First）：
 * - 本模块是纯函数，零副作用
 * - 不依赖 Prisma / Next.js / React
 * - 输入输出仅依赖于字符串与结构化 Record
 */

// ═══════════════════════════════════════════════════════════════════
// 类型
// ═══════════════════════════════════════════════════════════════════

export interface WorkflowSystemPromptParams {
  /** 工作流唯一标识 */
  workflowId: string;
  /** 工作流人类可读标题 */
  workflowTitle: string;
  /** 关联的行业包 ID（可选） */
  industryPackId?: string;
  /** 从 Industry Pack manifest 提取的技能 ID 列表（如 ["ft-inquiry-sorter", ...]） */
  industryPackSkills?: string[];
  /** Hermes 编排层注入的上下文负载 */
  contextPayload: Record<string, unknown>;
  /** 工作流运行实例 ID */
  workflowRunId: string;
}

// ═══════════════════════════════════════════════════════════════════
// 内部纯函数
// ═══════════════════════════════════════════════════════════════════

/**
 * 格式化上下文 payload 为可读行列表。
 * 自动跳过 undefined/null 值，对 object/array 类型做 JSON 序列化。
 */
function formatContextLines(payload: Record<string, unknown>): string {
  return Object.entries(payload)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => {
      const display =
        typeof value === "object" ? JSON.stringify(value) : String(value);
      return `  - ${key}: ${display}`;
    })
    .join("\n");
}

/**
 * 格式化技能列表为 Markdown 列表项。
 */
function formatSkillsBlock(skillIds: string[]): string {
  if (skillIds.length === 0) return "";

  return skillIds.map((id) => `  - ${id}`).join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// 主函数
// ═══════════════════════════════════════════════════════════════════

/**
 * 构建专业工作流级 systemPrompt。
 *
 * 结构包含 6 个区块：
 *   1. 角色与执行层声明
 *   2. 行业包能力绑定声明
 *   3. 上下文注入声明
 *   4. 输出质量标准
 *   5. 执行闭环要求
 *   6. 禁止事项
 */
export function buildWorkflowSystemPrompt(
  params: WorkflowSystemPromptParams,
): string {
  const {
    workflowTitle,
    industryPackId,
    industryPackSkills,
    contextPayload,
    workflowRunId,
  } = params;

  const contextLines = formatContextLines(contextPayload);
  const hasSkills =
    industryPackSkills !== undefined && industryPackSkills.length > 0;
  const skillsBlock = hasSkills
    ? formatSkillsBlock(industryPackSkills!)
    : "";

  // ── 区块 1：角色与执行层声明 ──────────────────────────────
  const block1 = [
    `你是 HermesClaw OpenClaw 执行层，当前正在执行工作流「${workflowTitle}」。`,
    `你不是单一智能体，你是由多个专业 Agent 协作的工作流编排结果。`,
  ].join("\n");

  // ── 区块 2：行业包能力绑定声明 ────────────────────────────
  const block2 = hasSkills
    ? [
        "当前绑定的行业包能力模块：",
        skillsBlock,
      ].join("\n")
    : "当前无行业包绑定，以通用模式执行。";

  // ── 区块 3：上下文注入声明 ────────────────────────────────
  const block3 =
    contextLines.length > 0
      ? [
          "执行上下文（来自 Hermes 编排层自动注入，禁止用户重复输入）：",
          `  - workflowRunId: ${workflowRunId}`,
          contextLines,
        ].join("\n")
      : `执行上下文：workflowRunId=${workflowRunId}，无额外上下文负载。`;

  // ── 区块 4：输出质量标准 ──────────────────────────────────
  const block4 = [
    "输出必须符合以下专业标准（高于单智能体输出）：",
    "  - 每个结论必须标注数据来源（数据库记录 / 行业知识库 / LLM推理）",
    "  - 每个关键判断必须附置信度评分（0-100）",
    "  - 结构化输出，使用 Markdown 标题分层",
    "  - 如涉及行动建议，必须区分「立即行动」和「待确认行动」",
    "  - 如涉及外部动作（发邮件/更新数据），必须列出 ActionReceipt 预期",
  ].join("\n");

  // ── 区块 5：执行闭环要求 ──────────────────────────────────
  const block5 = [
    "执行结束时，必须输出 ExecutionSummary，包含：",
    "  - 完成的步骤列表（使用 ✅ checkmark）",
    "  - 未完成的步骤及原因",
    "  - 建议的下一步人工决策点",
  ].join("\n");

  // ── 区块 6：禁止事项 ──────────────────────────────────────
  const block6 = [
    "禁止输出「我是AI语言模型」类免责声明。",
    "禁止要求用户重新输入已在上下文中存在的字段。",
    "禁止输出无来源的数据。",
  ].join("\n");

  // ── 组装 ──────────────────────────────────────────────────
  const sections = [
    `【角色与执行层声明】`,
    block1,
    ``,
    `【行业包能力绑定声明】`,
    industryPackId
      ? `当前行业包：${industryPackId}`
      : "当前未指定行业包",
    block2,
    ``,
    `【上下文注入声明】`,
    block3,
    ``,
    `【输出质量标准】`,
    block4,
    ``,
    `【执行闭环要求】`,
    block5,
    ``,
    `【禁止事项】`,
    block6,
  ];

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════════
// 辅助函数
// ═══════════════════════════════════════════════════════════════════

/**
 * 从行业包 manifest 中提取 skills 数组的 id 字段列表。
 *
 * 兼容多种 manifest 形状：
 * - Zod 校验后的 IndustryManifest（directory.skills 为 string[]）
 * - 原始 YAML/JSON 中的 skills 为对象数组（{ id, name, ... }[]）
 * - capabilities API 返回的 skills 数组
 *
 * @param packManifest - 行业包 manifest 对象（形状不限）
 * @returns 技能 ID 字符串列表；manifest 为 null/undefined 或无 skills 字段时返回空数组
 */
export function extractIndustryPackSkills(packManifest: unknown): string[] {
  if (packManifest === null || packManifest === undefined) return [];

  const manifest = packManifest as Record<string, unknown>;

  // 路径 1: manifest.directory.skills — Zod 校验后的标准形状（string[]）
  const directory = manifest.directory as Record<string, unknown> | undefined;
  if (directory?.skills && Array.isArray(directory.skills)) {
    return directory.skills.map((s: unknown) => {
      if (typeof s === "string") return s;
      if (typeof s === "object" && s !== null) {
        const obj = s as Record<string, unknown>;
        return typeof obj.id === "string" ? obj.id : String(s);
      }
      return String(s);
    });
  }

  // 路径 2: manifest.skills — 直接从 capabilities API 或原始 YAML 来
  const skills = manifest.skills;
  if (skills && Array.isArray(skills)) {
    return skills.map((s: unknown) => {
      if (typeof s === "string") return s;
      if (typeof s === "object" && s !== null) {
        const obj = s as Record<string, unknown>;
        return typeof obj.id === "string"
          ? obj.id
          : typeof obj.name === "string"
            ? obj.name
            : String(s);
      }
      return String(s);
    });
  }

  // 路径 3: manifest.directory?.workflows — 回退到 workflow ids
  if (directory?.workflows && Array.isArray(directory.workflows)) {
    return directory.workflows.map((w: unknown) => {
      if (typeof w === "string") return w;
      if (typeof w === "object" && w !== null) {
        const obj = w as Record<string, unknown>;
        return typeof obj.id === "string" ? obj.id : String(w);
      }
      return String(w);
    });
  }

  return [];
}
