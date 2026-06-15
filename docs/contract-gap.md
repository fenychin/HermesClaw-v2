# Contract Layer Gap Audit — v0.12.13 Migration

> 生成时间：2026-06-15
> 触发版本：契约层从 `src/contracts/` 抽离至 `packages/event-contracts` + `packages/harness-schema`（CLAUDE.md §3.3 渐进式拆分前置）
> 审计范围：所有 API handler（`src/app/api/**`）与 server 业务模块（`src/lib/server/**`）对契约对象的实际使用情况

---

## 1. 摘要

| 维度 | 现状 | 评级 |
|---|---|---|
| TaskEnvelope 字段对齐 AGENTS.md §3.3 | 唯一构造点 [skill-executor.ts:298-312](src/lib/server/workflow/skill-executor.ts#L298) 12 必备字段齐全 | ✅ |
| ActionReceipt 字段齐全 | [client.ts:124-135](src/lib/server/adapters/openclaw/client.ts#L124) 含 receiptId/idempotencyKey/version | ✅ |
| ExecutionEvent emit 链 | event-emitter / dag-runner / mock 三处使用，事件族对齐 OpenClaw 命名 | ✅ |
| BoundaryDecision 集成 | [boundary.ts](src/lib/server/hermes/boundary.ts) 已落地，`@/contracts` 直接消费 | ✅ |
| API handler 直接构造 TaskEnvelope | **零**——所有 envelope 由 server 层 [skill-executor.ts](src/lib/server/workflow/skill-executor.ts) 与 [scheduler.ts](src/lib/server/workflow/scheduler.ts) 构造 | ⚠️ 见 §2.1 |
| Hermes ↔ OpenClaw 双向闭环 | thin Next API 直接调 LLM，未走 envelope 完整闭环 | ⚠️ 见 §2.2 |
| ExecutionSummary 落库 | 仅契约 schema，未见 server 写入路径 | ❌ 见 §2.3 |
| CapabilityRegistration 注册路径 | 仅契约 schema，未见运行时使用 | ❌ 见 §2.4 |

---

## 2. 详细缺口

### 2.1 API handler 直接构造 TaskEnvelope 的能力缺失

**现象**：`POST /api/task` ([task/route.ts:143](src/app/api/task/route.ts#L143)) 用 `TaskExecuteSchema` 接收 `{ taskType, input }`，**未经过 TaskEnvelope 封装直接走 LLM**。

**对照 AGENTS.md §3.3**：跨域调用必须经过 TaskEnvelope；目前只有 `skill-executor` 在 DAG 内部使用 envelope 闭环。

**影响**：
- 快捷任务 `/api/task` 走旁路，不计入 workflowRun / receipt 留痕
- TypedTaskInputSchema ([task/route.ts:171](src/app/api/task/route.ts#L171)) 仅在 `_type` 存在时拦截，未与 envelope.actionType 联动

**修复路径（任务 3）**：
1. `/api/task` 改造为：`TaskExecuteSchema` → 构造 TaskEnvelope（含 idempotencyKey / policySnapshotVersion / workspaceId 等 12 必备字段）→ 经 `openclawClient.executeTask` 走 envelope 链路
2. 若快捷任务确属 thin path，需在 AGENTS.md §3.3 附录中显式标注例外，并在 AuditLog 留痕

### 2.2 Hermes ↔ OpenClaw 双向事件闭环未串

**现象**：
- Hermes 侧：`/api/hermes/suggestions` 是唯一的 hermes API，仅返回意图建议 ([suggestions/route.ts](src/app/api/hermes/suggestions/route.ts))
- OpenClaw 侧：`/api/openclaw/events` 是 SSE 订阅 endpoint，但**没有从 OpenClaw runtime 回流事件的 webhook**，事件全靠 server 内部 [event-emitter.ts](src/lib/server/adapters/openclaw/event-emitter.ts) 自发自收

**对照 AGENTS.md §3.3 / §5.2**：OpenClaw 必须经标准事件族回传 Hermes（run.* / tool.* / approval.* / artifact.*）。

**影响**：当前是单进程 Mock 闭环，真实 OpenClaw runtime 接入时缺 callback endpoint。

**修复路径（任务 3 或独立任务）**：
1. 新增 `POST /api/openclaw/callback`：接收 ExecutionEvent / ActionReceipt / ExecutionSummary，按 schema 校验后入库
2. TaskEnvelope.callbackTarget 当前硬编码为 `'local-workflow-callback'` ([skill-executor.ts:309](src/lib/server/workflow/skill-executor.ts#L309))，需切换为 `internal:openclaw/callback` 或外部 URL

### 2.3 ExecutionSummary 落库与查询缺口

**现象**：契约层 [execution-summary.ts](packages/event-contracts/src/execution-summary.ts) 已定义完整 schema，但：
- `prisma/schema.prisma` 未见 `ExecutionSummary` 表
- server 层无任何 `ExecutionSummarySchema.parse(...)` 调用
- API 无 `GET /api/tasks/:id/summary` 之类查询端点

**对照 AGENTS.md §3.3 / CLAUDE.md §8.2**：ExecutionSummary 与 Receipt Store 是审计四层之一。

**修复路径（独立任务）**：
1. Prisma 增 `ExecutionSummary` 模型（taskId / workflowRunId / status / actionReceiptIds 数组 / version 等）
2. WorkflowRun 完成时由 dag-runner 汇总 emit 一份 ExecutionSummary 入库
3. 暴露 `GET /api/workflows/:runId/summary`

### 2.4 CapabilityRegistration 注册路径缺口

**现象**：契约层 [capability-registration.ts](packages/event-contracts/src/capability-registration.ts) 已定义 schema，但：
- 无 `POST /api/openclaw/capabilities/register` handler
- server 层未见 CapabilityRegistration 校验或落库

**对照 AGENTS.md §3.3**：OpenClaw runtime 启动时必须向 Hermes 注册可执行的 actionTypes / connectors。

**修复路径（独立任务）**：
1. 增 Prisma 模型 `RuntimeCapability`（runtimeId / actionTypes / compatibleHermesApi / lastSeenAt）
2. 新增 `POST /api/openclaw/capabilities/register` handler
3. dispatcher 选 envelope.actionType 时校验 capability 注册有效性

### 2.5 IdempotencyKey 跨链一致性未做断言

**现象**：[client.ts:129](src/lib/server/adapters/openclaw/client.ts#L129) 把 envelope.idempotencyKey 透传到 receipt，但：
- 没有数据库唯一索引保证幂等
- 没有 e2e 测试断言"重放同一 envelope 必然产生同一 receipt"

**修复路径（独立任务）**：
1. ActionReceipt 表对 (workspaceId, idempotencyKey) 加 UNIQUE 索引
2. 增 e2e 测试覆盖幂等场景

---

## 3. 已知技术债（迁移前已存在，本次未修）

| 位置 | 问题 | 处理建议 |
|---|---|---|
| [task-payloads.ts:130](packages/event-contracts/src/task-payloads.ts#L130) | `ctx.addIssue(issue)` zod v4 类型不兼容（issue 是 `$ZodIssue`，addIssue 参数已收紧），目前 tsc 报 TS2345 | 改为 `ctx.addIssue({ code: 'custom', message: issue.message, path: issue.path })` 或 issue 形态适配 |
| [task-payloads.ts:73](packages/event-contracts/src/task-payloads.ts#L73), [task-payloads.ts:104](packages/event-contracts/src/task-payloads.ts#L104) | `as any` 显式类型抹除，触发 lint `@typescript-eslint/no-explicit-any` | 重构为 `as unknown as <Type>` 或加 type guard |
| [.next/dev/types/validator.ts](.next/dev/types/validator.ts) | Next 16 dev 模式生成的 validator.ts 在 strict 模式下有 3 个 syntax error（TS1005 / TS1109 / TS1128） | tsconfig 中 `exclude` 加 `.next/dev/types/**`，或等 Next 16 修复 |
| [agents/[id]/execute/route.ts:141,148,154](src/app/api/agents/[id]/execute/route.ts#L141) | 引用 `boundary.violation` 字段，但 [BoundaryDecisionSchema](packages/event-contracts/src/boundary-decision.ts) 实际只有 `reason` 字段（a26b180 落地 BoundaryDecision 时未对齐 handler）| handler 改用 `boundary.reason`，或 schema 补 `violation` 字段 |
| [memory/[id]/route.ts:84](src/app/api/memory/[id]/route.ts#L84) | 引用 `tags` 字段但 schema 中无该字段 | 校验 schema 与 handler 对齐 |
| [workflows/run/__tests__/route.test.ts:88](src/app/api/workflows/run/__tests__/route.test.ts#L88) | 调用形参数量不匹配 | 测试代码同步 handler 签名 |
| 全仓 lint 105 problems (68 errors / 37 warnings) | 历史代码 any / 未使用变量 / prefer-const | `pnpm lint --fix` 可修 1 项；其余按优先级清理 |

---

## 4. 验证清单

- [x] `pnpm tsc --noEmit -p tsconfig.json` 仅剩 .next 预存 syntax error 与 task-payloads 预存 ZodIssue 类型不兼容（迁移前后一致）
- [x] `pnpm vitest run` 全绿（422 tests / 50 files passed）
- [x] `pnpm lint` 105 problems 与迁移前完全一致，**未引入新 lint 错误**
- [x] `node_modules/@hermesclaw/{event-contracts,harness-schema,shared-types}` 三个 workspace 软链接正确指向 `packages/`
- [x] `src/contracts/index.ts` 改为兼容层 `export * from "@hermesclaw/{event,harness}-..."`，所有 `@/contracts/<sub>` 子路径 shim 文件保留
- [x] event-contracts 不依赖 Next.js / Prisma / 行业包：仅 zod
- [x] harness-schema 仅依赖 @hermesclaw/event-contracts + zod

---

## 5. 后续路线（建议）

| 优先级 | 任务 | 关联节 |
|---|---|---|
| P0 | OpenClaw callback endpoint + ExecutionSummary 落库 | §2.2 §2.3 |
| P0 | `/api/task` 切换到 envelope 链路（或显式标注 thin-path 例外） | §2.1 |
| P1 | CapabilityRegistration 注册路径 | §2.4 |
| P1 | task-payloads 修复 zod v4 类型不兼容 | §3 |
| P2 | IdempotencyKey 数据库唯一索引 + e2e 幂等测试 | §2.5 |
| P2 | 全仓 lint 清理（错误 → 0） | §3 |
| v0.13+ | 正式拆 monorepo（apps/web + services/* + packages/* 完整化）| CLAUDE.md §3.3 |

---

## 6. v0.12.13 本次任务（契约合规性修复）完成项

> 触发任务：「TaskEnvelope / ExecutionEvent 协议合规性验证与现有 handler 修复」
> 完成时间：2026-06-15

| 任务点 | 状态 | 落地文件 |
|---|---|---|
| Step 2 ：合规 Hermes → OpenClaw 派发入口 | ✅ | [src/app/api/tasks/envelope/route.ts](src/app/api/tasks/envelope/route.ts) |
| Step 3 ：OpenClaw → Hermes ExecutionEvent ingest | ✅ | [src/app/api/openclaw/events/route.ts](src/app/api/openclaw/events/route.ts)（新增 POST，与既有 SSE GET 共用资源） |
| Step 4-A ：IdempotencyKey 表 + (workspaceId, key) 唯一索引 | ✅ | [prisma/schema.prisma](prisma/schema.prisma)、[migration.sql](prisma/migrations/20260615000000_add_idempotency_and_execution_event_log/migration.sql) |
| Step 4-B ：ExecutionEventLog 表（eventId 唯一） | ✅ | 同上 |
| Step 4-C ：幂等 / policy-snapshot 工具库 | ✅ | [src/lib/idempotency.ts](src/lib/idempotency.ts)、[src/lib/policy-snapshot.ts](src/lib/policy-snapshot.ts) |
| Step 5 ：Hermes ↔ OpenClaw 契约 e2e 测试（7 用例） | ✅ | [src/test/e2e/hermes-openclaw-contract.test.ts](src/test/e2e/hermes-openclaw-contract.test.ts) —— 7/7 通过 |
| Step 6-A ：connectors/email/send 接入幂等键 | ✅ | [src/app/api/connectors/email/send/route.ts](src/app/api/connectors/email/send/route.ts) |
| Step 6-B ：harness/proposals/[id]/approve 接入幂等键 | ✅ | [src/app/api/harness/proposals/[id]/approve/route.ts](src/app/api/harness/proposals/[id]/approve/route.ts) |
| Step 6-C ：harness/proposals/[id]/reject 接入幂等键 | ✅ | [src/app/api/harness/proposals/[id]/reject/route.ts](src/app/api/harness/proposals/[id]/reject/route.ts) |
| Step 6-D ：harness/proposals/[id]/rollback 接入幂等键 | ✅ | [src/app/api/harness/proposals/[id]/rollback/route.ts](src/app/api/harness/proposals/[id]/rollback/route.ts) |
| Step 7 ：vitest 配置可运行 e2e 目录 | ✅ | 现有 `src/**/*.{test,spec}.{ts,tsx}` 通配已覆盖 `src/test/e2e/`，无需额外 alias（`@hermesclaw/event-contracts` 经 pnpm workspace symlink 解析） |

### 验证结果

| 验证项 | 结论 |
|---|---|
| `pnpm vitest run` | 51 files / 429 tests 全绿（基线 422 + 新增 7） |
| `pnpm vitest run src/test/e2e/hermes-openclaw-contract.test.ts` | 7/7 通过 |
| `pnpm tsc --noEmit` | 28 errors，**全部为 §3 表已记录的迁移前技术债**，本次 0 新增 |
| `pnpm prisma migrate status` | 新增 `20260615000000_add_idempotency_and_execution_event_log` 与历史一致以 `db push` 模式同步 dev.db；生产部署使用 `prisma migrate deploy` |
| `grep "idempotencyKey\|x-idempotency-key" src/app/api/ -rn` | 5 处 handler（envelope / events / email send / 3 个 proposal 治理接口）已接入 |

### 本次未覆盖（明确遗留 TODO）

| 项目 | 原因 | 处理 |
|---|---|---|
| `/api/task` 快捷 LLM 通道幂等 | 该端点不写 Task 表、纯 LLM 同步调用，与 envelope 派发链路职责正交 | 在 §2.1 / §5 P0 路线项中列出 |
| 其他 25+ 个写操作 handler 幂等键 | 单次任务范围控制（与用户确认仅修高危路径） | §5 路线项 P2 |
| `/api/openclaw/events` POST 写 AuditLog 时 `workspaceId='default'` 降级 | runtime 上报时不持有 workspaceId，需要 taskId → workspaceId 反查 | 待 ExecutionSummary 表落库时一并解决（§2.3 P0） |
| `policy-snapshot.ts` 当前固定返回 `1.0.0` baseline | HarnessBundle / PolicySnapshot 表尚未建立，写入 proposalId 会破坏 semver schema | 待 v0.13+ HarnessBundle 落地（CLAUDE.md §3.3） |
| dev.db 与 migration history 错配 | 历史用 `db push` 同步，已知问题（[devdb-schema-drift-rbac](memory/devdb-schema-drift-rbac.md) 有记） | 备份分支前可 `prisma migrate resolve` 标记历史已应用，或下次重装 |
