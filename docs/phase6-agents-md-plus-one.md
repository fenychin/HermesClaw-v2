# AGENTS.md+1 — Phase 6 审计与回滚治理补充

> **提案类型：** AGENTS.md 补充条款（治理层）  
> **提案日期：** 2026-06-22  
> **提案人：** HermesClaw Phase 6 审计与回滚验证专项  
> **目标版本：** AGENTS.md v3.28.00-dev

---

## 建议条目 1：四层日志证据链强制要求

**位置：** AGENTS.md 第四章（审计与合规）后新增 §4.X

**内容：**

> ### §4.X 四层日志证据链
>
> 1. 所有跨域写操作必须能在四层日志中形成完整证据链：
>    - **L1 AuditLog** — 治理审批链（Hermes 真相源）
>    - **L2 AgentLog** — Agent 执行行为与风险记录（Hermes 评估输入）
>    - **L3 WorkflowRun** — 结构化运行记录（OpenClaw Runtime）
>    - **L4 ActionReceipt** — 外部动作回执（OpenClaw Runtime，Phase 6 新增）
>
> 2. 证据链可串行性：同一 `workflowRunId` 必须能串联全部四层日志。
>
> 3. 连接器执行必须同时写入 L1 AuditLog（预记录模式）和 L4 ActionReceipt。
>
> 4. 高危写操作（不可逆外部动作）的回执必须声明 `compensationStrategy`。
>
> 5. 无回执的写操作默认视为高风险，必须在 AuditLog 中标记 `riskLevel=high`。

**理由：** Phase 6 发现 ActionReceipt 只有 Zod 契约而无数据库存储，导致四层日志缺少 L4。补齐后需在治理文档中强制要求。

---

## 建议条目 2：行业包操作审计强制要求

**位置：** AGENTS.md 第六章（Industry Pack）后新增 §6.X

**内容：**

> ### §6.X 行业包操作审计
>
> 1. 以下行业包操作必须写入 AuditLog（预记录模式）：
>    - `industry.pack.install` — 安装时记录 packId、版本、兼容性声明
>    - `industry.pack.activate` — 激活时记录激活范围与影响评估
>    - `industry.pack.rollback` — 回滚时记录迁移规则与回滚原因
>
> 2. install 审计的 `contextSnapshot` 必须包含：
>    - `compatibleHermesApi` — 兼容的 Hermes API 版本
>    - `compatibleRuntimeApi` — 兼容的 Runtime API 版本
>    - `migrationRules` — 迁移规则（如有）
>
> 3. 不兼容的行业包在装载阶段被拒绝时，也须写入 AuditLog（status=failed）。

**理由：** Phase 6 发现 `industry.pack.*` 操作此前无审计覆盖，属于治理缺口。

---

## 建议条目 3：自动化等级变更审计强制要求

**位置：** AGENTS.md 第四章 §4.7（自动化授权等级）后补充

**内容：**

> 4. 自动化等级变更（`automation.level.change`）必须：
>    - 使用预记录模式写入 AuditLog（riskLevel=high）
>    - `contextSnapshot` 必须包含 `previousLevel` 和 `newLevel`
>    - 变更原因必须明确记录（如 "连续 30 天自动化审批成功率 > 95%"）
>    - L3→L4 变更必须附加人工审批签名

**理由：** Phase 6 发现 `automation.level.change` 此前无审计覆盖。自动化等级提升是最危险的配置变更之一，必须有审计留痕。

---

## 建议条目 4：回滚必须基于 Snapshot/Version

**位置：** AGENTS.md 第五章 §5.X（回滚策略）强化

**内容：**

> ### §5.X 回滚策略（强化）
>
> 1. 所有回滚操作必须基于 `HarnessSnapshot`（快照/version），禁止手工覆盖当前对象字段。
>
> 2. 回滚操作必须记录 `restoredFields`（字段级 diff），用于事后审计。
>
> 3. 回滚完成后，被引用的 snapshot 状态必须更新为 `rolled-back-to`。
>
> 4. 回滚审计链必须包含：
>    - `canary.aborted` — 触发回滚的原因与指标
>    - `proposal.rollback` — 回滚执行详情
>    - `harness.snapshot.restored` — 快照恢复记录
>
> 5. 回滚超时（5 分钟）后自动标记为 failed，可手动重试。

**理由：** 现有实现已满足此要求，但 AGENTS.md 中未显式声明。需写入治理文档确保未来变更不退化。

---

## 建议条目 5：Canary 双实现统一

**位置：** 不在 AGENTS.md 正文，作为工程改进建议附在治理补充中

**内容：**

> **工程改进建议（非治理条款）：**
>
> 当前 canary 逻辑存在双实现：
> - `apps/web/src/lib/server/canary.ts`（errorRate 阈值 5%/20%）
> - `packages/hermes-kernel/src/handlers/harness-handler.ts`（successRate 阈值 95%）
>
> 建议统一到 `packages/hermes-kernel/src/harness/lifecycle.ts` 的 `DEFAULT_CANARY_THRESHOLDS`，以 kernel 层为唯一真相源。apps 层通过 DI 注入 kernel 阈值。

**理由：** Phase 6 审计发现双实现层阈值不一致，可能导致同一 proposal 在不同路径下得到不同的 canary 评估结果。

---

## 实施优先级

| 条目 | 类型 | 优先级 | 影响范围 |
|------|------|--------|----------|
| §4.X 四层日志证据链 | 治理条款 | P0 — 立即 | 所有跨域写操作 |
| §6.X 行业包审计 | 治理条款 | P0 — 立即 | Industry Pack 安装/激活/回滚 |
| §4.7 自动化等级审计 | 治理条款 | P0 — 立即 | 自动化等级变更 |
| §5.X 回滚基于快照 | 治理条款 | P1 — 下次发布 | 回滚操作 |
| Canary 双实现统一 | 工程改进 | P2 — 技术债 | canary 评估逻辑 |
