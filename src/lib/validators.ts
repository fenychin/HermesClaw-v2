/**
 * API 输入验证 Schema（生产安全加固）
 * —— 使用 Zod 对所有 POST/PATCH 接口的请求体做严格校验，防止恶意输入。
 */
import { z } from "zod";

// ==============================
// 智能体
// ==============================

export const AgentCreateSchema = z.object({
  name: z.string().min(1).max(50),
  role: z.string().min(1).max(100),
  description: z.string().max(500).optional().default(""),
  status: z.enum(["running", "idle", "error", "paused"]).optional().default("idle"),
  source: z.enum(["builtin", "custom", "industry"]).optional().default("custom"),
  category: z.array(z.string()).optional().default([]),
  bindSkills: z.array(z.string()).optional().default([]),
  bindConnectors: z.array(z.string()).optional().default([]),
  memoryPermission: z.enum(["read", "read-write", "none"]).optional().default("read"),
  harnessVersion: z.string().max(20).optional().default("v1.0.0"),
  canDo: z.array(z.string()).optional().default([]),
  cannotDo: z.array(z.string()).optional().default([]),
  statsJson: z.record(z.string(), z.unknown()).optional().default({}),
  lastActive: z.string().nullable().optional().default(null),
});

export const AgentUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  role: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  status: z.enum(["running", "idle", "error", "paused"]).optional(),
  source: z.enum(["builtin", "custom", "industry"]).optional(),
  category: z.array(z.string()).optional(),
  bindSkills: z.array(z.string()).optional(),
  bindConnectors: z.array(z.string()).optional(),
  memoryPermission: z.enum(["read", "read-write", "none"]).optional(),
  harnessVersion: z.string().max(20).optional(),
  canDo: z.array(z.string()).optional(),
  cannotDo: z.array(z.string()).optional(),
  statsJson: z.record(z.string(), z.unknown()).optional(),
  lastActive: z.string().nullable().optional(),
  // 二次确认字段
  confirm: z.string().optional(),
});

/** Agent 执行请求 */
export const AgentExecuteSchema = z.object({
  action: z.string().min(1).max(2000),
});

/** Agent 日志写入请求 */
export const AgentLogCreateSchema = z.object({
  taskName: z.string().min(1).max(200),
  status: z.enum(["success", "error", "running"]),
  duration: z.string().min(1).max(20),
  detail: z.string().max(2000).optional(),
});

// ==============================
// 项目
// ==============================

export const ProjectCreateSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(["customer", "order", "exhibition", "product-line"]),
  status: z.enum(["active", "archived", "completed"]).optional().default("active"),
  owner: z.string().min(1).max(100),
  relatedClient: z.string().max(200).nullable().optional().default(null),
  country: z.string().max(100).nullable().optional().default(null),
  productLine: z.string().max(200).nullable().optional().default(null),
  activeAgents: z.array(z.string()).optional().default([]),
  riskPoints: z.array(z.string()).optional().default([]),
  nextActions: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
});

// ==============================
// 记忆
// ==============================

export const MemoryCreateSchema = z.object({
  type: z.enum(["short", "mid", "long"]).optional().default("short"),
  content: z.string().min(1).max(10000),
  summary: z.string().max(500).optional().default(""),
  source: z.string().max(50).optional().default("manual"),
  relatedProject: z.string().max(100).nullable().optional().default(null),
  relatedAgent: z.string().max(100).nullable().optional().default(null),
  confidence: z.number().min(0).max(1).optional().default(0.8),
  frozen: z.boolean().optional().default(false),
  tags: z.array(z.string()).optional().default([]),
  projectId: z.string().uuid().nullable().optional().default(null),
});

export const MemoryUpdateSchema = z.object({
  frozen: z.boolean().optional(),
  type: z.enum(["short", "mid", "long"]).optional(),
  content: z.string().max(10000).optional(),
  summary: z.string().max(500).optional(),
  confidence: z.number().min(0).max(1).optional(),
  confirm: z.string().optional(),
  reason: z.string().max(500).optional(),
});

// ==============================
// 对话 / 消息
// ==============================

export const ConversationCreateSchema = z.object({
  title: z.string().max(200).optional().default("新对话"),
  projectId: z.string().uuid().nullable().optional().default(null),
  initialMessage: z.string().max(10000).optional(),
});

export const ConversationMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().min(1).max(10000),
});

// ==============================
// 连接器
// ==============================

export const ConnectorCreateSchema = z.object({
  name: z.string().min(1).max(50),
  iconEmoji: z.string().max(10).optional().default("🔌"),
  description: z.string().max(500).optional().default(""),
  status: z.enum(["connected", "available", "disconnected", "error"]).optional().default("available"),
  category: z.string().min(1).max(50),
  lastSync: z.string().nullable().optional().default(null),
  permissions: z.array(z.string()).optional().default([]),
  usedByAgents: z.array(z.string()).optional().default([]),
});

export const ConnectorUpdateSchema = z.object({
  status: z.enum(["connected", "available", "disconnected", "error"]).optional(),
  name: z.string().min(1).max(50).optional(),
  description: z.string().max(500).optional(),
});

// ==============================
// 工具注册 / 授权
// ==============================

export const ToolCreateSchema = z.object({
  name: z.string().min(1).max(50),
  description: z.string().max(500).optional().default(""),
  category: z.string().max(50).optional().default("system"),
  scopes: z.array(z.string()).optional().default([]),
  riskLevel: z.enum(["low", "mid", "high"]).optional().default("low"),
  enabled: z.boolean().optional().default(true),
});

export const ToolGrantSchema = z.object({
  toolId: z.string().min(1),
  agentId: z.string().min(1),
  scopes: z.array(z.string()).optional().default([]),
  approvedBy1: z.string().optional(),
  approvedBy2: z.string().optional(),
});

// ==============================
// Harness 提案 / 评估
// ==============================

export const HarnessEvaluateSchema = z.object({
  triggeredBy: z.enum(["auto", "manual"]).optional().default("manual"),
});

export const HarnessProposalCreateSchema = z.object({
  proposalId: z.string().max(50).optional(),
  triggeredBy: z.enum(["auto", "manual"]).optional().default("auto"),
  problemStatement: z.string().min(1).max(2000),
  evidence: z.array(z.unknown()).optional().default([]),
  targetComponent: z.string().min(1).max(100),
  proposedChange: z.string().min(1).max(2000),
  riskLevel: z.enum(["low", "mid", "high"]).optional().default("low"),
  automationLevel: z.enum(["L1", "L2", "L3", "L4"]).optional(),
  status: z.enum(["pending", "approved", "rejected", "implemented"]).optional().default("pending"),
  estimatedImpact: z.string().max(500).optional().default(""),
  reviewedBy: z.string().max(50).nullable().optional().default(null),
  reviewedAt: z.string().nullable().optional().default(null),
});

export const HarnessProposalUpdateSchema = z.object({
  action: z.enum(["approve", "reject"]).optional(),
  reviewedBy: z.string().max(50).optional().default("system"),
  confirm: z.boolean().optional(),
  status: z.string().max(20).optional(),
  reviewedAt: z.string().optional(),
});

export const HarnessSpecGenerateSchema = z.object({
  businessIntent: z.string().min(1).max(1000),
  industry: z.string().min(1).max(100),
  agentRole: z.string().min(1).max(100),
});

// ==============================
// 聊天 / 快捷任务
// ==============================

export const ChatMessageSchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(10000),
      }),
    )
    .min(1)
    .max(50),
  systemPrompt: z.string().max(5000).optional(),
  /** 客户端模型偏好（如 "claude-sonnet-4-6"），用于覆写策略路由的默认模型 */
  modelId: z.string().max(100).optional(),
});

export const TaskExecuteSchema = z.object({
  taskType: z.string().min(1).max(50),
  input: z.string().min(1).max(5000),
});

// ==============================
// 技能（"沉淀为技能"功能）
// ==============================

export const SkillCreateSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(1000),
  version: z.string().max(20).optional(),
  category: z.string().max(100).optional(),
  inputSchema: z.string().max(5000).optional(),
  outputSchema: z.string().max(5000).optional(),
  scenarios: z.string().max(2000).optional(),
  automationLevel: z.enum(["L1", "L2", "L3", "L4"]).optional(),
});

// ==============================
// 外贸询盘
// ==============================

/** 询盘创建请求 Schema（对接真实业务写入链路） */
export const InquiryCreateSchema = z.object({
  fromEmail: z.string().email().max(200),
  subject: z.string().min(1).max(500),
  content: z.string().min(1).max(10000),
  countryCode: z.string().min(2).max(3).optional().default("US"),
});

// ==============================
// 外贸报价
// ==============================

/** 报价创建请求 Schema */
export const QuotationCreateSchema = z.object({
  inquiryId: z.string().min(1).max(100),
  totalAmount: z.string().min(1).max(100),
  currency: z.string().min(1).max(10).optional().default("USD"),
  version: z.number().int().min(1).max(999).optional().default(1),
});

// ==============================
// 校验工具函数
// ==============================

/**
 * 对请求体做 Zod 校验，失败时返回标准 400 错误。
 * 用法：
 *   const parsed = validateBody(await req.json(), AgentCreateSchema)
 *   if (parsed instanceof Response) return parsed
 *   const validated = parsed  // 类型收窄后的安全数据
 */
export function validateBody<T>(body: unknown, schema: z.ZodSchema<T>): T | Response {
  const result = schema.safeParse(body);
  if (!result.success) {
    return Response.json(
      {
        success: false,
        error: "参数验证失败",
        details: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      },
      { status: 400 },
    );
  }
  return result.data;
}
