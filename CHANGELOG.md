# Changelog

## [0.13.0] — 2026-06-15

### 🚀 Phase 2 MVP 收敛发布

此版本完成 HermesClaw v2 的 MVP 核心功能收敛，达到外贸行业内测可演示标准。

### ✨ 新增功能

#### 契约层独立化（Phase 2 Week 1）
- 独立 `@hermesclaw/event-contracts` 包：TaskEnvelope / ExecutionEvent / ExecutionSummary zod schema
- 独立 `@hermesclaw/harness-schema` 包：AgentPolicy / WorkflowTemplate schema
- 独立 `@hermesclaw/shared-types` 包：跨域共享类型定义
- pnpm Monorepo workspace 配置

#### Handler 协议合规
- `/api/task/dispatch` 接入幂等键（x-idempotency-key）防重，相同键返回 `idempotent: true`
- TaskEnvelope zod schema 全字段校验（含 policySnapshotVersion / runtimeId）
- 新增 IdempotencyKey / ExecutionEventLog Prisma model
- `/api/openclaw/events` 接入 ExecutionEvent schema 校验 + eventId 去重
- OpenClaw → Harness 终态回调（completed/failed 事件自动触发 harness evaluate）

#### Harness 治理闭环（Phase 2 Week 2）
- Proposal 创建 → 审批通过/拒绝 → Bundle CANARY → 全量激活/回滚 完整状态机
- 快照机制（`HarnessBundleSnapshot`）支持一键回滚
- `harness/evaluate`：基础指标计算（成功率/平均耗时）+ 触发条件自动生成提案
- `harness/generate-spec`：LLM 生成提案 + 规则引擎 fallback（LLM 不可用时不中断链路）
- `harness/cron`：每 3 天自动评估所有 Workspace（Vercel Cron 调度）
- `harness/evolution-log`：评估历史可查
- 审批/回滚/删除全部预写 AuditLog，空 reason 回滚被拒绝

#### L1/L2 自动化等级配置（Phase 2 Week 2）
- `AutomationPolicy` Prisma model：按 Workspace × Agent × ActionType 粒度配置
- 策略解析器（policy-resolver.ts）：三级优先级
- 等级门禁（level-guard.ts）：L3/L4 升级需审批，L4 默认禁止
- `/api/workspace/automation-policy`：GET / POST / PATCH 完整实现
- `/api/workspace/pack-agents`：从 Pack manifest 动态读取 Agent 列表 + actionTypes

#### 外贸 Industry Pack v1（Phase 2 Week 3）
- manifest.json：声明 8 Agent / 8 Workflow / 13 Skill / 2 Connector
- eval-rules/baseline.json：4 条外贸指标规则
- `/api/packs/foreign-trade/inquiries`：询盘 CRUD + 按状态筛选
- `/api/packs/foreign-trade/inquiries/[id]/grade`：基于规则引擎的询盘自动分级（HIGH/MEDIUM/LOW）
- `/api/packs/foreign-trade/quotations/[id]/send`：L1 建议模式 / L2 执行模式
- AutomationPolicy 配置面板与外贸 Agent 绑定

### 🔒 安全与合规
- `dev.db.bak` 历史泄露文件已从 Git 历史中清除
- `.gitignore` 加固，防止 DB 文件意外提交
- AuditLog 覆盖 12 种关键操作类型（task.dispatch / task.evaluate / automation.level.change 等）
- L4 全自动等级默认禁止，仅通过环境变量白名单开放
- middleware.ts 与 src/middleware.ts 双文件同步（CI check:middleware 断言）

### 🔧 基础设施
- vercel.json：Harness Cron（0 3 */3 * *）+ 周维护 Cleanup（0 3 * * 0）
- 新增 `pnpm smoke` / `pnpm smoke:harness` / `pnpm smoke:ft` 三套冒烟脚本
- 新增 `pnpm smoke:all` 全量冒烟入口
- Claude Code 外贸技能模板（seed-skills.ts 含 13 个技能种子）
- ESLint 三域架构边界隔离规则（no-restricted-imports）

### 📊 测试覆盖
- 全量单元测试：58 文件 / 592 用例通过
- event-contracts 包：导出完整性 + TaskEnvelope/ExecutionEvent schema 校验
- harness-schema 包：HarnessBundle 7 件套 + BundleStatus 合法/非法转换
- Harness 状态机：Acceptance 14 用例（含 fallback 路径）
- 外贸 Pack：Manifest 8 项静态一致性 + API 4 项
- 全量冒烟：主链路 23/23 + Harness 闭环 10/10 + 外贸 Pack 9/9

### 🐛 修复（Week 4 回归中）
- 修复 ESLint 57 `no-explicit-any` + 23 `no-unused-vars` → 0 errors 0 warnings
- 修复 Harness 冒烟脚本 Cron 响应格式匹配问题（wrapped in `{success, data}`）
- 修复 `catch (error: unknown)` TypeScript 类型收窄
- 修复 Prisma schema 格式化问题

### ⚠️ 已知限制（计划在 v0.14.0 解决）
- Email Connector 当前为 stub 模式（`EMAIL_CONNECTOR_ENABLED=false`），不产生真实发送
- Harness evaluate 的 LLM 生成提案依赖 ANTHROPIC_API_KEY，否则自动降级为规则引擎 fallback
- L3 自动化等级 UI 配置已就位但审批流程尚未完整（Beta 阶段仅支持 L1/L2）
- 询盘 grade 当前为规则引擎驱动，需 LLM 驱动替换（ft-inquiry-grading skill）
- AutomationPolicy UI 面板 actionTypes 返回 0（需排查 manifest 集成）
