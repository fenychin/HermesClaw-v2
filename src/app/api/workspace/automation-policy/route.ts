/**
 * /api/workspace/automation-policy —— 自动化授权等级三级粒度配置（AGENTS.md §4.7 / §5.2 / §6.2）
 *
 * —— GET (MEMBER+) 列表 + 全局默认策略 + 可选 effective 模拟
 * —— POST (ADMIN+) 创建策略；automationLevel 升 L3/L4 一律 422 拒绝（必须走 Harness 提案）
 * —— PATCH (ADMIN+) 更新；仅在等级真升级时校验 Harness 审批 / L4 白名单
 * —— DELETE (ADMIN+) 删除；?policyId=&confirm=true
 *
 * —— 所有变更写 AuditLog `automation.level.change` / `automation.policy.delete`，
 *    contextSnapshot 携带 previousLevel/newLevel/policyId 以便溯源。
 */
import { NextResponse } from "next/server"
import { z } from "zod"
import {
  AutomationLevelSchema,
  RiskLevelSchema,
  type AutomationLevel,
} from "@hermesclaw/event-contracts"
import { withRBAC } from "@/lib/server/shared/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import {
  listPolicies,
  findPolicyById,
  createPolicy,
  updatePolicy,
  deletePolicy as deletePolicyRow,
} from "@/lib/server/repositories/automation-policy"
import {
  resolveAutomationPolicy,
  type ResolvedPolicy,
} from "@/lib/automation/policy-resolver"
import { validateLevelChange, isL4Allowed } from "@/lib/automation/level-guard"
import {
  createAuditEntry,
  updateAuditEntry,
  actorFromSession,
} from "@/lib/server/shared/audit"
import { checkConfirmQuery } from "@/lib/server/hermes/guardrail"
import { mapAutomationToAuditRisk } from "@/types"
import { parseJsonField } from "@/lib/api-utils"
import { logger } from "@/lib/logger"

export const runtime = "nodejs"

// ==============================
// 请求体 schema
// ==============================

const CreatePolicySchema = z.object({
  agentId: z.string().min(1).nullable(),
  actionType: z.string().min(1).nullable(),
  automationLevel: AutomationLevelSchema,
  riskLevel: RiskLevelSchema,
  requireApproval: z.boolean().default(false),
  requireApproverIds: z.array(z.string()).default([]),
  priority: z.number().int().min(0).max(999).default(0),
  description: z.string().max(500).optional(),
})

const UpdatePolicySchema = z.object({
  policyId: z.string().min(1),
  automationLevel: AutomationLevelSchema.optional(),
  riskLevel: RiskLevelSchema.optional(),
  requireApproval: z.boolean().optional(),
  requireApproverIds: z.array(z.string()).optional(),
  priority: z.number().int().min(0).max(999).optional(),
  description: z.string().max(500).nullable().optional(),
})

// ==============================
// 序列化（DB row → API shape）
// ==============================

interface PolicyDto {
  policyId: string
  workspaceId: string
  agentId: string | null
  actionType: string | null
  automationLevel: string
  riskLevel: string
  requireApproval: boolean
  requireApproverIds: string[]
  priority: number
  description: string | null
  createdBy: string
  updatedBy: string
  createdAt: string
  updatedAt: string
}

function toDto(row: {
  id: string
  workspaceId: string
  agentId: string | null
  actionType: string | null
  automationLevel: string
  riskLevel: string
  requireApproval: boolean
  requireApproverIds: string
  priority: number
  description: string | null
  createdBy: string
  updatedBy: string
  createdAt: Date
  updatedAt: Date
}): PolicyDto {
  return {
    policyId: row.id,
    workspaceId: row.workspaceId,
    agentId: row.agentId,
    actionType: row.actionType,
    automationLevel: row.automationLevel,
    riskLevel: row.riskLevel,
    requireApproval: row.requireApproval,
    requireApproverIds: parseJsonField<string[]>(row.requireApproverIds, []),
    priority: row.priority,
    description: row.description,
    createdBy: row.createdBy,
    updatedBy: row.updatedBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

function policyScope(agentId: string | null, actionType: string | null): string {
  if (agentId !== null && actionType !== null) return `action:${agentId}/${actionType}`
  if (agentId !== null) return `agent:${agentId}`
  return "workspace"
}

// ==============================
// GET (MEMBER+)
// ==============================

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const { searchParams } = new URL(request.url)
  const agentIdQ = searchParams.get("agentId")
  const actionTypeQ = searchParams.get("actionType")

  const rows = await listPolicies(ctx.workspaceId)

  const policies = rows.map(toDto)
  const globalPolicy: ResolvedPolicy = await resolveAutomationPolicy(
    ctx.workspaceId,
    null,
    null,
  )

  let effective: ResolvedPolicy | null = null
  if (agentIdQ !== null || actionTypeQ !== null) {
    effective = await resolveAutomationPolicy(
      ctx.workspaceId,
      agentIdQ,
      actionTypeQ,
    )
  }

  return NextResponse.json({
    success: true,
    data: { policies, globalPolicy, effective, l4Allowed: isL4Allowed(ctx.workspaceId) },
  })
}, "MEMBER")

// ==============================
// POST (ADMIN+)
// ==============================

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const raw = await request.json().catch(() => null)
  const parsed = CreatePolicySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", issues: parsed.error.issues },
      { status: 422 },
    )
  }
  const data = parsed.data

  // 业务约束：agentId=null + actionType!=null 不允许
  if (data.agentId === null && data.actionType !== null) {
    return NextResponse.json(
      {
        success: false,
        error: "INVALID_SCOPE",
        message: "agentId 为空时 actionType 也必须为空（workspace-default 不分动作）",
      },
      { status: 422 },
    )
  }

  // 升级门禁：把"创建"看作 from=L1 的升级，L3/L4 一律拒绝
  const guard = validateLevelChange("L1", data.automationLevel, ctx.workspaceId)
  if (!guard.ok) {
    return NextResponse.json(
      { success: false, error: guard.code, message: guard.message },
      { status: guard.code === "L4_NOT_ALLOWED" ? 403 : 422 },
    )
  }

  const actor = await actorFromSession()
  const audit = await createAuditEntry({
    actor,
    action: "automation.level.change",
    targetType: "automation_policy",
    targetId: "pending",
    riskLevel: mapAutomationToAuditRisk(data.automationLevel),
    workspaceId: ctx.workspaceId,
    automationLevel: data.automationLevel,
    triggeredBy: "user",
    detail: `automation.level.change null → ${data.automationLevel} on ${policyScope(data.agentId, data.actionType)}`,
    contextSnapshot: {
      action: "create",
      scope: policyScope(data.agentId, data.actionType),
      agentId: data.agentId,
      actionType: data.actionType,
      previousLevel: null,
      newLevel: data.automationLevel,
      requireApproval: data.requireApproval,
      approverIds: data.requireApproverIds,
    },
  })

  let created: PolicyDto
  try {
    const row = await createPolicy({
      workspaceId: ctx.workspaceId,
      agentId: data.agentId,
      actionType: data.actionType,
      automationLevel: data.automationLevel,
      riskLevel: data.riskLevel,
      requireApproval: data.requireApproval,
      requireApproverIds: JSON.stringify(data.requireApproverIds),
      priority: data.priority,
      description: data.description ?? null,
      createdBy: actor,
      updatedBy: actor,
    })
    created = toDto(row)
  } catch (error) {
    // 唯一约束冲突
    if (
      error instanceof Error &&
      "code" in error &&
      (error as { code?: string }).code === "P2002"
    ) {
      await updateAuditEntry({
        auditId: audit.auditId,
        status: "failed",
        detail: "POLICY_CONFLICT",
      })
      return NextResponse.json(
        {
          success: false,
          error: "POLICY_CONFLICT",
          message: "该 (agent, actionType) 组合已存在策略，请改为编辑",
        },
        { status: 409 },
      )
    }
    logger.error("[POST /api/workspace/automation-policy] 创建失败", {
      workspaceId: ctx.workspaceId,
      error: error instanceof Error ? error.message : "未知错误",
    })
    await updateAuditEntry({ auditId: audit.auditId, status: "failed" })
    return NextResponse.json(
      { success: false, error: "INTERNAL_ERROR", message: "创建失败" },
      { status: 500 },
    )
  }

  await updateAuditEntry({
    auditId: audit.auditId,
    status: "success",
    contextSnapshot: {
      action: "create",
      policyId: created.policyId,
      scope: policyScope(created.agentId, created.actionType),
      agentId: created.agentId,
      actionType: created.actionType,
      previousLevel: null,
      newLevel: created.automationLevel,
      requireApproval: created.requireApproval,
      approverIds: created.requireApproverIds,
    },
  })

  return NextResponse.json(
    { success: true, data: { policy: created } },
    { status: 201 },
  )
}, "ADMIN")

// ==============================
// PATCH (ADMIN+)
// ==============================

export const PATCH = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const raw = await request.json().catch(() => null)
  const parsed = UpdatePolicySchema.safeParse(raw)
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "VALIDATION_ERROR", issues: parsed.error.issues },
      { status: 422 },
    )
  }
  const data = parsed.data

  const existing = await findPolicyById(data.policyId)
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return NextResponse.json(
      { success: false, error: "POLICY_NOT_FOUND" },
      { status: 404 },
    )
  }

  const previousLevel = existing.automationLevel as AutomationLevel
  const newLevel = data.automationLevel ?? previousLevel

  // 仅在等级真升级时校验
  if (data.automationLevel && data.automationLevel !== previousLevel) {
    const guard = validateLevelChange(previousLevel, data.automationLevel, ctx.workspaceId)
    if (!guard.ok) {
      return NextResponse.json(
        { success: false, error: guard.code, message: guard.message },
        { status: guard.code === "L4_NOT_ALLOWED" ? 403 : 422 },
      )
    }
  }

  const actor = await actorFromSession()
  const changedFields = Object.keys(data).filter((k) => k !== "policyId")

  const audit = await createAuditEntry({
    actor,
    action: "automation.level.change",
    targetType: "automation_policy",
    targetId: existing.id,
    riskLevel: mapAutomationToAuditRisk(newLevel),
    workspaceId: ctx.workspaceId,
    automationLevel: newLevel,
    triggeredBy: "user",
    detail: `automation.level.change ${previousLevel} → ${newLevel} on ${policyScope(existing.agentId, existing.actionType)}`,
    contextSnapshot: {
      action: "update",
      policyId: existing.id,
      scope: policyScope(existing.agentId, existing.actionType),
      agentId: existing.agentId,
      actionType: existing.actionType,
      previousLevel,
      newLevel,
      changedFields,
    },
  })

  const updated = await updatePolicy(existing.id, {
    automationLevel: data.automationLevel ?? undefined,
    riskLevel: data.riskLevel ?? undefined,
    requireApproval:
      data.requireApproval !== undefined ? data.requireApproval : undefined,
    requireApproverIds:
      data.requireApproverIds !== undefined
        ? JSON.stringify(data.requireApproverIds)
        : undefined,
    priority: data.priority !== undefined ? data.priority : undefined,
    description:
      data.description === null
        ? null
        : data.description !== undefined
          ? data.description
          : undefined,
    updatedBy: actor,
  })

  await updateAuditEntry({ auditId: audit.auditId, status: "success" })

  return NextResponse.json({ success: true, data: { policy: toDto(updated) } })
}, "ADMIN")

// ==============================
// DELETE (ADMIN+)
// ==============================

export const DELETE = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  const { searchParams } = new URL(request.url)
  const policyId = searchParams.get("policyId")
  if (!policyId) {
    return NextResponse.json(
      { success: false, error: "MISSING_POLICY_ID" },
      { status: 400 },
    )
  }

  const guard = await checkConfirmQuery(request, "删除策略需二次确认（追加 ?confirm=true）")
  if (!guard.ok) return guard.response

  const existing = await findPolicyById(policyId)
  if (!existing || existing.workspaceId !== ctx.workspaceId) {
    return NextResponse.json(
      { success: false, error: "POLICY_NOT_FOUND" },
      { status: 404 },
    )
  }

  const actor = await actorFromSession()
  const audit = await createAuditEntry({
    actor,
    action: "automation.policy.delete",
    targetType: "automation_policy",
    targetId: existing.id,
    riskLevel: mapAutomationToAuditRisk(existing.automationLevel as AutomationLevel),
    workspaceId: ctx.workspaceId,
    automationLevel: existing.automationLevel as AutomationLevel,
    triggeredBy: "user",
    detail: `automation.policy.delete ${existing.automationLevel} on ${policyScope(existing.agentId, existing.actionType)}`,
    contextSnapshot: {
      action: "delete",
      policyId: existing.id,
      scope: policyScope(existing.agentId, existing.actionType),
      agentId: existing.agentId,
      actionType: existing.actionType,
      removedLevel: existing.automationLevel,
    },
  })

  await deletePolicyRow(existing.id)
  await updateAuditEntry({ auditId: audit.auditId, status: "success" })

  return NextResponse.json({ success: true, data: { policyId: existing.id } })
}, "ADMIN")
