"use client"

/**
 * 自动化等级配置面板（AGENTS.md §4.7 / §5.2 / §6.2）
 *
 * —— 三个分组：
 *      1. Workspace 全局默认（globalPolicy；agentId=null, actionType=null）
 *      2. Agent 默认（agentId 非空, actionType=null）
 *      3. Action 特定（agentId 非空, actionType 非空，priority 列）
 * —— 右侧栏：生效模拟器（前端按 (agentId, actionType) 在内存里解析）
 *
 * 业务约束：
 *   - L3/L4 升级直接走 Harness 提案；这里 selector 选了 L3/L4 后保存按钮仍可点，
 *     但服务端会返回 422，前端 toast 提示。这是有意设计，避免在前端做 false-OK。
 *   - L4 selector 在 !l4Allowed 时 disabled（白名单门禁）。
 */

import { Suspense, useMemo, useState } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import {
  AutomationLevelSchema,
  RiskLevelSchema,
  type AutomationLevel,
  type RiskLevel,
} from "@hermesclaw/event-contracts"
import { PageTransition } from "@/components/common/PageTransition"
import { PageHeader } from "@/components/common/page-header"
import { EmptyState } from "@/components/common/empty-state"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { useWorkspaceData } from "@/hooks/use-workspace"
import { useAgents } from "@/hooks/use-foreign-trade-resources"
import { isAdmin, type WorkspaceRole } from "@/lib/workspace-roles"
import {
  useAutomationPolicies,
  useUpsertAutomationPolicy,
  useDeleteAutomationPolicy,
  useEffectivePolicy,
  type AutomationPolicyDto,
  type ResolvedPolicyDto,
} from "@/hooks/use-automation-policies"
import { AutomationLevelBadge } from "@/components/automation/AutomationLevelBadge"
import { AutomationLevelSelector } from "@/components/automation/AutomationLevelSelector"
import {
  ShieldCheck,
  Plus,
  Trash2,
  ChevronLeft,
  AlertTriangle,
  RotateCcw,
} from "lucide-react"

const RISK_LEVELS: RiskLevel[] = ["low", "medium", "high", "critical"]

const SOURCE_LABEL: Record<ResolvedPolicyDto["source"], string> = {
  "system-default": "系统默认（无策略）",
  "workspace-default": "Workspace 全局默认",
  "agent-default": "Agent 默认策略",
  "action-specific": "Action 特定策略",
}

// ==============================
// 全局默认卡片
// ==============================

function GlobalPolicyCard({
  globalPolicy,
  policies,
  l4Allowed,
  canManage,
}: {
  globalPolicy: ResolvedPolicyDto
  policies: AutomationPolicyDto[]
  l4Allowed: boolean
  canManage: boolean
}) {
  const upsert = useUpsertAutomationPolicy()

  // 找现有 workspace-default 行的 policyId（POST/PATCH 分流）
  const existing = useMemo(
    () => policies.find((p) => p.agentId === null && p.actionType === null) ?? null,
    [policies],
  )

  const [level, setLevel] = useState<AutomationLevel>(globalPolicy.automationLevel)
  const [risk, setRisk] = useState<RiskLevel>(globalPolicy.riskLevel)
  const [requireApproval, setRequireApproval] = useState(globalPolicy.requireApproval)

  const dirty =
    level !== globalPolicy.automationLevel ||
    risk !== globalPolicy.riskLevel ||
    requireApproval !== globalPolicy.requireApproval

  const handleSave = () => {
    upsert.mutate({
      policyId: existing?.policyId,
      agentId: null,
      actionType: null,
      automationLevel: level,
      riskLevel: risk,
      requireApproval,
      requireApproverIds: existing?.requireApproverIds ?? [],
      priority: existing?.priority ?? 0,
    })
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-foreground flex items-center gap-2">
            <ShieldCheck className="size-4 text-brand" />
            Workspace 全局默认
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            未配置 agent / action 策略时的回退默认值；当前来源：
            <Badge variant="outline" className="ml-1 text-[10px]">
              {SOURCE_LABEL[globalPolicy.source]}
            </Badge>
          </p>
        </div>
        {canManage && dirty && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setLevel(globalPolicy.automationLevel)
              setRisk(globalPolicy.riskLevel)
              setRequireApproval(globalPolicy.requireApproval)
            }}
          >
            <RotateCcw className="size-3.5 mr-1" />
            重置
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium text-foreground">自动化等级</label>
        <AutomationLevelSelector
          value={level}
          onChange={setLevel}
          disabled={!canManage}
          l4Allowed={l4Allowed}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">风险等级</label>
          <select
            value={risk}
            onChange={(e) => setRisk(RiskLevelSchema.parse(e.target.value))}
            disabled={!canManage}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40 disabled:opacity-50"
          >
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-1.5">
          <label className="text-sm font-medium text-foreground">人工审批</label>
          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={requireApproval}
              disabled={!canManage}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="size-4 rounded border-border"
            />
            <span className="text-sm text-muted-foreground">
              要求人工审批后再派发任务
            </span>
          </div>
        </div>
      </div>

      {canManage && (
        <div className="flex justify-end pt-2 border-t border-border">
          <Button
            type="button"
            disabled={!dirty || upsert.isPending}
            onClick={handleSave}
          >
            {upsert.isPending ? "保存中…" : existing ? "更新全局默认" : "创建全局默认"}
          </Button>
        </div>
      )}
    </div>
  )
}

// ==============================
// Agent / Action 策略表
// ==============================

interface PolicyTableProps {
  title: string
  description: string
  rows: AutomationPolicyDto[]
  showAction: boolean
  showPriority: boolean
  onEdit: (row: AutomationPolicyDto) => void
  onDelete: (row: AutomationPolicyDto) => void
  onCreate: () => void
  canManage: boolean
}

function PolicyTable({
  title,
  description,
  rows,
  showAction,
  showPriority,
  onEdit,
  onDelete,
  onCreate,
  canManage,
}: PolicyTableProps) {
  return (
    <div className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className="text-base font-semibold text-foreground">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
        {canManage && (
          <Button size="sm" variant="outline" onClick={onCreate}>
            <Plus className="size-3.5 mr-1" />
            新增
          </Button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="py-8 text-center text-xs text-muted-foreground">
          暂无策略，使用上方「新增」按钮添加
        </div>
      ) : (
        <div className="border border-border rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-xs text-muted-foreground">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Agent</th>
                {showAction && (
                  <th className="text-left px-3 py-2 font-medium">Action</th>
                )}
                <th className="text-left px-3 py-2 font-medium">等级</th>
                <th className="text-left px-3 py-2 font-medium">风险</th>
                <th className="text-left px-3 py-2 font-medium">审批</th>
                {showPriority && (
                  <th className="text-left px-3 py-2 font-medium">优先级</th>
                )}
                <th className="text-right px-3 py-2 font-medium">操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.policyId} className="border-t border-border">
                  <td className="px-3 py-2 font-mono text-xs">
                    {r.agentId ?? "—"}
                  </td>
                  {showAction && (
                    <td className="px-3 py-2 font-mono text-xs">
                      {r.actionType ?? "—"}
                    </td>
                  )}
                  <td className="px-3 py-2">
                    <AutomationLevelBadge level={r.automationLevel} size="sm" />
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.riskLevel}
                  </td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {r.requireApproval ? "✔" : "—"}
                  </td>
                  {showPriority && (
                    <td className="px-3 py-2 text-xs text-muted-foreground">
                      {r.priority}
                    </td>
                  )}
                  <td className="px-3 py-2 text-right space-x-1">
                    {canManage && (
                      <>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onEdit(r)}
                        >
                          编辑
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => onDelete(r)}
                        >
                          <Trash2 className="size-3.5 text-danger" />
                        </Button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ==============================
// 编辑/新增对话框（行内表单）
// ==============================

interface PolicyEditorProps {
  agents: { id: string; name: string }[]
  initial: Partial<AutomationPolicyDto> | null
  scope: "agent" | "action"
  onClose: () => void
  l4Allowed: boolean
}

function PolicyEditor({ agents, initial, scope, onClose, l4Allowed }: PolicyEditorProps) {
  const upsert = useUpsertAutomationPolicy()
  const [agentId, setAgentId] = useState<string>(
    initial?.agentId ?? agents[0]?.id ?? "",
  )
  const [actionType, setActionType] = useState<string>(initial?.actionType ?? "")
  const [level, setLevel] = useState<AutomationLevel>(
    initial?.automationLevel
      ? AutomationLevelSchema.parse(initial.automationLevel)
      : "L1",
  )
  const [risk, setRisk] = useState<RiskLevel>(
    initial?.riskLevel ? RiskLevelSchema.parse(initial.riskLevel) : "low",
  )
  const [requireApproval, setRequireApproval] = useState(
    initial?.requireApproval ?? false,
  )
  const [priority, setPriority] = useState<number>(initial?.priority ?? 0)

  const isEdit = Boolean(initial?.policyId)
  const valid =
    agentId.length > 0 && (scope === "agent" || actionType.length > 0)

  const handleSave = () => {
    upsert.mutate(
      {
        policyId: initial?.policyId,
        agentId,
        actionType: scope === "action" ? actionType : null,
        automationLevel: level,
        riskLevel: risk,
        requireApproval,
        requireApproverIds: initial?.requireApproverIds ?? [],
        priority,
      },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div className="flex items-start justify-between">
        <h3 className="text-base font-semibold text-foreground">
          {isEdit ? "编辑策略" : `新增 ${scope === "agent" ? "Agent" : "Action"} 策略`}
        </h3>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <ChevronLeft className="size-4 mr-1" />
          返回
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">Agent</label>
          <select
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {agents.length === 0 && <option value="">（无可用 agent）</option>}
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.id}
              </option>
            ))}
          </select>
        </div>
        {scope === "action" && (
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Action Type</label>
            <input
              type="text"
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              placeholder="例如 send_email"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
            />
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <label className="text-sm font-medium">自动化等级</label>
        <AutomationLevelSelector
          value={level}
          onChange={setLevel}
          l4Allowed={l4Allowed}
        />
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        <div className="space-y-1.5">
          <label className="text-sm font-medium">风险等级</label>
          <select
            value={risk}
            onChange={(e) => setRisk(RiskLevelSchema.parse(e.target.value))}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            {RISK_LEVELS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">人工审批</label>
          <label className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              checked={requireApproval}
              onChange={(e) => setRequireApproval(e.target.checked)}
              className="size-4"
            />
            <span className="text-sm text-muted-foreground">
              派发前需人工确认
            </span>
          </label>
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-medium">优先级（0–999）</label>
          <input
            type="number"
            min={0}
            max={999}
            value={priority}
            onChange={(e) => setPriority(Number(e.target.value) || 0)}
            className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-300">
        <AlertTriangle className="size-3.5 flex-shrink-0" />
        <span>
          直接把等级保存为 L3/L4 会被服务端 422 拒绝；请先在{" "}
          <Link href="/settings/harness" className="underline font-medium">
            Harness 提案面板
          </Link>{" "}
          创建审批后再回来。
        </span>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onClose}>
          取消
        </Button>
        <Button
          disabled={!valid || upsert.isPending}
          onClick={handleSave}
        >
          {upsert.isPending ? "保存中…" : isEdit ? "保存修改" : "创建策略"}
        </Button>
      </div>
    </div>
  )
}

// ==============================
// 生效模拟器
// ==============================

function PolicySimulator({
  agents,
  policies,
}: {
  agents: { id: string; name: string }[]
  policies: AutomationPolicyDto[]
}) {
  const [agentId, setAgentId] = useState<string | null>(null)
  const [actionType, setActionType] = useState<string>("")
  const effective = useEffectivePolicy(policies, agentId, actionType || null)

  return (
    <div className="bg-card border border-border rounded-2xl p-6 space-y-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">生效模拟器</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          模拟某次任务在三级回退下会命中哪条策略
        </p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">Agent</label>
        <select
          value={agentId ?? ""}
          onChange={(e) => setAgentId(e.target.value || null)}
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">（不指定）</option>
          {agents.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs font-medium text-muted-foreground">
          Action Type
        </label>
        <input
          type="text"
          value={actionType}
          onChange={(e) => setActionType(e.target.value)}
          placeholder="例如 send_email"
          className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      <div className="rounded-xl border border-border bg-muted/30 p-4 space-y-2 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">来源</span>
          <Badge variant="outline" className="text-[10px]">
            {SOURCE_LABEL[effective.source]}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">等级</span>
          <AutomationLevelBadge level={effective.automationLevel} size="sm" />
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">风险</span>
          <span className="font-mono">{effective.riskLevel}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">需审批</span>
          <span>{effective.requireApproval ? "是" : "否"}</span>
        </div>
      </div>
    </div>
  )
}

// ==============================
// 主页面
// ==============================

function AutomationSettingsContent() {
  const { data: session } = useSession()
  const { members } = useWorkspaceData()
  const { items: agents = [] } = useAgents() as {
    items: { id: string; name: string }[]
  }
  const { policies, globalPolicy, l4Allowed, isLoading } =
    useAutomationPolicies()
  const deleteMutation = useDeleteAutomationPolicy()

  const currentRole: WorkspaceRole =
    (members.find((m) => m.email === session?.user?.email)?.role as WorkspaceRole) ??
    "VIEWER"
  const canManage = isAdmin(currentRole)

  const [editor, setEditor] = useState<{
    initial: Partial<AutomationPolicyDto> | null
    scope: "agent" | "action"
  } | null>(null)

  const agentRows = policies.filter(
    (p) => p.agentId !== null && p.actionType === null,
  )
  const actionRows = policies.filter(
    (p) => p.agentId !== null && p.actionType !== null,
  )

  const handleDelete = (row: AutomationPolicyDto) => {
    if (!confirm(`确认删除策略？\nagent: ${row.agentId ?? "—"}\naction: ${row.actionType ?? "—"}`)) {
      return
    }
    deleteMutation.mutate(row.policyId)
  }

  if (isLoading || !globalPolicy) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full rounded-2xl" />
        <Skeleton className="h-48 w-full rounded-2xl" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full p-6">
      <PageHeader
        title="自动化等级"
        description="按 workspace / agent / actionType 三级粒度配置 L1-L4 自动化授权（AGENTS.md §5.2）"
      />

      {!canManage && (
        <div className="mt-4 bg-warning/10 border border-warning/30 rounded-xl p-3 text-xs text-warning">
          仅管理员（OWNER / ADMIN）可修改策略，当前为只读视图。
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6 mt-6 min-h-0 overflow-y-auto pb-10">
        <div className="lg:col-span-2 space-y-6">
          {editor ? (
            <PolicyEditor
              agents={agents}
              initial={editor.initial}
              scope={editor.scope}
              onClose={() => setEditor(null)}
              l4Allowed={l4Allowed}
            />
          ) : (
            <>
              <GlobalPolicyCard
                globalPolicy={globalPolicy}
                policies={policies}
                l4Allowed={l4Allowed}
                canManage={canManage}
              />

              <PolicyTable
                title="Agent 默认策略"
                description="针对单个 agent 的默认等级（actionType 为空）"
                rows={agentRows}
                showAction={false}
                showPriority={false}
                onEdit={(row) => setEditor({ initial: row, scope: "agent" })}
                onDelete={handleDelete}
                onCreate={() => setEditor({ initial: null, scope: "agent" })}
                canManage={canManage}
              />

              <PolicyTable
                title="Action 特定策略"
                description="针对 (agent, actionType) 的精确策略；priority 高者优先"
                rows={actionRows}
                showAction={true}
                showPriority={true}
                onEdit={(row) => setEditor({ initial: row, scope: "action" })}
                onDelete={handleDelete}
                onCreate={() => setEditor({ initial: null, scope: "action" })}
                canManage={canManage}
              />

              {agents.length === 0 && (
                <EmptyState
                  icon={ShieldCheck}
                  title="尚未创建 agent"
                  description="无法配置 agent / action 维度的策略；先到智能体管理添加。"
                />
              )}
            </>
          )}
        </div>

        <div className="space-y-4">
          <PolicySimulator agents={agents} policies={policies} />
        </div>
      </div>
    </div>
  )
}

export default function AutomationSettingsPage() {
  return (
    <PageTransition>
      <Suspense
        fallback={
          <div className="p-6 text-sm text-muted-foreground">加载中…</div>
        }
      >
        <AutomationSettingsContent />
      </Suspense>
    </PageTransition>
  )
}
