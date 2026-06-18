# PR: feat(harness): Sprint 1-3 完整 Harness 自演化引擎 + Policy 矩阵 + Canary 管线

**Base**: `main` ← **Head**: `v3.20.00-dev`

PR 创建链接：https://github.com/fenychin/HermesClaw-v2/compare/main...v3.20.00-dev?expand=1

---

## 概述

完整实现 HermesClaw Harness 自演化体系（Sprint 1-3），包括：评估引擎、提案生成、Policy 裁决矩阵、Canary 部署管线、AuditLog 治理留痕、API 路由 E2E 接入。

## Sprint 1：评估引擎 + Policy 裁决

### 评估引擎 [packages/hermes-kernel/src/harness/index.ts](packages/hermes-kernel/src/harness/index.ts)

**`runHarnessEvaluation()`** — 真实 DB 信号采集 + LLM 分析

- 信号源：`AgentLog` (status=error) / `WorkflowRun` (status=failed) / `ConnectorLog` (success=false) / `AuditLog` (correction|memory.miss)
- LLM 输出兼容裸 JSON / ` ```json ` 代码块 / 含解释性文字
- LLM 失败兜底：按原始信号 `count>=5→high` / 否则 `medium`

**`generateHarnessProposals()`** — severity≥medium 的结果写入 HarnessProposal

- `previousSnapshot` 存储 workspace 策略快照（`automationLevel + WorkspaceSettings`）
- 单条 `prisma.create` 失败不阻断整体，记录 `status: 'create-failed'` 后继续

### Policy 矩阵 [packages/hermes-kernel/src/policy/index.ts](packages/hermes-kernel/src/policy/index.ts)

**`checkPolicy()`** — 严格按 4×4 `(riskLevel × automationLevel)` 矩阵裁决：

| riskLevel \ Level | L1 | L2 | L3 | L4 |
|------|----|----|----|----|
| low | allowed | allowed | allowed | confirm |
| medium | allowed | confirm | approval | blocked |
| high | confirm | approval | blocked | blocked |
| critical | approval | blocked | blocked | blocked |

- `Workspace.automationLevel` 缺失时降级到 L2
- 暴露 `checkPolicySync()` 纯函数版给 `dag-runner` 等高频路径

## Sprint 2：Canary 管线 + AuditLog

### Schema 变更 [prisma/schema.prisma](prisma/schema.prisma)

`HarnessProposal` 新增 10 个 nullable 字段：

- `approvedBy/At`, `rejectedBy/At`, `rolledBackBy/At`
- `canaryStartedAt`, `canaryConfig` (Json), `canaryCompletedAt`, `canaryRollbackReason`
- 索引：`canaryStartedAt`（cron 扫描用）

迁移：[prisma/migrations/20260617120000_add_harness_canary_fields/migration.sql](prisma/migrations/20260617120000_add_harness_canary_fields/migration.sql)

### Canary 触发 `approveHarnessProposal`

- `riskLevel ∈ {high, critical}` → `status=canary` + `canaryStartedAt` + `canaryConfig`
- `riskLevel ∈ {low, medium}` → `status=active`（直接生效）
- 默认 `canaryConfig: { durationHours: 24, successThreshold: 0.95 }`

### Promote/Rollback `promoteCanaryToActive`

- 窗口未到点 → `outcome=pending`（`force=true` 可绕过）
- 窗口到点 + 样本量≥5 + `successRate≥threshold` → 晋级 `active`
- 否则 → 自动 `rollback` 并记录 `canaryRollbackReason`

### AuditLog 写入 `writeProposalAudit`

所有决策点（approve/reject/rollback/promote）自动写 AuditLog：

- `action`: `proposal.approve` / `proposal.reject` / `proposal.rollback` / `proposal.promote`
- `detail` JSON: `{ before, after, ...metrics }`
- 写失败不阻塞业务（try/catch 静默）

## Sprint 3：API 路由 E2E + 5 场景验证

### API 路由改造

| 路由 | 改造点 |
|------|--------|
| `POST /api/harness/evaluate` | 走 kernel `runHarnessEvaluation + generateHarnessProposals` |
| `POST /api/harness/proposals/[id]/approve` | 走 kernel canary 逻辑（high→canary） |
| `POST /api/harness/proposals/[id]/reject` | 走 kernel `rejectHarnessProposal` |
| `POST /api/harness/proposals/[id]/rollback` | 走 kernel `rollbackHarnessProposal` |
| `GET /api/harness/cron` | 扫描 canary 提案 → 调用 `promoteCanaryToActive` |
| `POST /api/task` | critical action 接入 `checkPolicy` 拦截（403 + `requiresApproval`） |

### E2E 场景测试 (44 个用例)

| 场景 | 验证 |
|------|------|
| **A** AI 评估→提案生成 | 信号采集 + LLM 分析 + DB 写入全链路 |
| **B** 人工审批→Canary | high → canary（非直接 active）+ AuditLog |
| **C** Canary→自动 Promote | 期满+成功率达标 → active + `proposal.promote` AuditLog |
| **D** Canary→自动 Rollback | 期满+错误率超阈值 → rolled-back + `proposal.rollback` AuditLog |
| **E** Policy 拦截 | L3+high=blocked, L2+critical=blocked, L4+low=confirm |

## 验收结果

- ✅ `pnpm -r tsc --noEmit`: 5 个 workspace 全部 **0 errors**
- ✅ `pnpm -r test`: **295 tests passed** (event-contracts: 175, hermes-kernel: 44, openclaw-adapter: 19, industry-pack-sdk: 4, apps/web: 53), **0 failures**
- ✅ Vercel Cron: `vercel.json` 已含 `/api/harness/cron` (`0 3 */3 * *`)
- ✅ `README.md`: 中英双语 Harness 使用说明

## 三域边界遵守 (CLAUDE.md §2.1, §3.2)

- ✅ 评估引擎在 **Hermes Control Kernel** 域，未跨入 OpenClaw / Industry Pack
- ✅ 信号源全部来自标准化日志表，无任何 `industryId` 字面量
- ✅ Contract-First：`RunHarnessEvaluationInput`, `PolicyCheckInput`, `CanaryConfig` 等契约在 kernel 层暴露
- ✅ apps/web 路由层只通过 `@hermesclaw/hermes-kernel` 公开 API 调用 kernel，无私有模块直接 import

## 文件变更摘要

**新增 (2 文件):**

- [packages/hermes-kernel/src/__tests__/harness-and-policy.test.ts](packages/hermes-kernel/src/__tests__/harness-and-policy.test.ts) — 44 个测试用例
- [prisma/migrations/20260617120000_add_harness_canary_fields/migration.sql](prisma/migrations/20260617120000_add_harness_canary_fields/migration.sql) — Canary 字段迁移

**修改 (12 文件):**

- [packages/hermes-kernel/src/harness/index.ts](packages/hermes-kernel/src/harness/index.ts) (+537)
- [packages/hermes-kernel/src/handlers/harness-handler.ts](packages/hermes-kernel/src/handlers/harness-handler.ts) (+654)
- [packages/hermes-kernel/src/policy/index.ts](packages/hermes-kernel/src/policy/index.ts) (+174)
- [packages/hermes-kernel/src/index.ts](packages/hermes-kernel/src/index.ts) (导出新类型)
- [prisma/schema.prisma](prisma/schema.prisma) (HarnessProposal +10 字段)
- [README.md](README.md) (Harness 使用说明)
- [apps/web/src/app/api/harness/evaluate/route.ts](apps/web/src/app/api/harness/evaluate/route.ts)
- [apps/web/src/app/api/harness/cron/route.ts](apps/web/src/app/api/harness/cron/route.ts)
- [apps/web/src/app/api/harness/proposals/[id]/approve/route.ts](apps/web/src/app/api/harness/proposals/[id]/approve/route.ts)
- [apps/web/src/app/api/harness/proposals/[id]/reject/route.ts](apps/web/src/app/api/harness/proposals/[id]/reject/route.ts)
- [apps/web/src/app/api/harness/proposals/[id]/rollback/route.ts](apps/web/src/app/api/harness/proposals/[id]/rollback/route.ts)
- [apps/web/src/app/api/task/route.ts](apps/web/src/app/api/task/route.ts) (checkPolicy 接入)
