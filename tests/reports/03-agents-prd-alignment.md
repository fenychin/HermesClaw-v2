# AGENTS.md / PRD / CLAUDE.md 对齐矩阵

**日期**: 2026-06-21

---

## 1. 核心治理规则对齐

| 规则来源 | 规则内容 | 对齐状态 | 证据 |
|----------|---------|---------|------|
| AGENTS.md §6.1 | 所有 Workspace 操作在 RBAC 下完成 | ✅ 部分 | `withRBAC` 实现，但仅限 automation-level 和 team |
| AGENTS.md §6.2 | 关键行为必须写 AuditLog | ✅ 部分 | `automation.level.change` 有 AuditLog；billing/rewards/auth 操作无 |
| AGENTS.md §3.5 | AuditLog 禁止物理删除 | ✅ 符合 | 无 delete AuditLog 代码 |
| AGENTS.md §3.3 | Email bodyHtml/bodyText 不记入 AuditLog | ❌ N/A | 无邮件服务实现 |
| PRD §9.2 | Workspace + RBAC 为 MVP 必做 | ✅ 部分 | RBAC 四级角色存在，但大部分 settings API 无 RBAC |
| PRD §9.2 | AuditLog/AgentLog 为 MVP 必做 | ✅ 符合 | AuditLog 系统完整（`audit.ts`, `api-handler.ts`）|
| PRD §14.2 GOV-01 | RBAC 三级权限校验完成 | ✅ 符合 | `hasMinRole()` / `withRBAC()` 实现 |
| PRD §15.2 | 不支持多人串联审批 | ⚠️ 已知缺口 | PRD 已承认此缺口 |
| CLAUDE.md §2.2 | Contract-First — 先定义 schema 再写 handler | ❌ **违反** | Billing/Rewards/Secrets/ApiKeys/Preferences 的 schema 在 contracts 包中不存在 |
| CLAUDE.md §3.1 | `apps/web` 不得直接持有纯逻辑 | ⚠️ 部分违反 | Auth logic (bcrypt) 直接写在 route.ts 中，但复杂度可接受 |
| CLAUDE.md §3.2 | 禁止跨域直接 import 私有实现 | ✅ 符合 | 未发现跨域 import 问题 |
| CLAUDE.md §8.1 | `connector.execute`, `proposal.*`, `automation.level.*` 必须写 AuditLog | ✅ 符合 | automation.level.change 有 AuditLog |
| CLAUDE.md §8.1 | `task.dispatch`, `task.cancel` 必须写 AuditLog | ✅ 符合 | 在 workflow 系统中已实现 |

---

## 2. 账户中心特定对齐

| 功能 | AGENTS.md 要求 | 实际实现 | 对齐? |
|------|---------------|---------|-------|
| **登录/注册** | 无特定要求 | Auth.js v5 + bcrypt + Prisma | ✅ |
| **Google OAuth** | 无特定要求 | Auth.js Google Provider | ✅ 但配置不完整 |
| **Turnstile** | 无特定要求 | 客户端 + 服务端验证 | ⚠️ 有开发绕过 |
| **忘记密码** | 无特定要求 | Mock（console.log） | ❌ 不可用 |
| **积分发放** | AGENTS.md §6.2 — AuditLog 记录 | 客户端 Zustand，无 AuditLog | ❌ **严重违反** |
| **套餐变更** | AGENTS.md §6.2 — AuditLog 记录 | Mock，无 AuditLog | ❌ **违反** |
| **Secrets CRUD** | CLAUDE.md §8.1 — 审计留痕 | 无 AuditLog，内存存储 | ❌ **违反** |
| **API Keys CRUD** | CLAUDE.md §8.1 — 审计留痕 | 无 AuditLog，内存存储 | ❌ **违反** |
| **偏好变更** | 无特定要求 | Echo，不持久化 | ⚠️ 功能缺失 |
| **密码修改** | AGENTS.md §6.2 — Security 事件审计 | Mock，不真实修改 | ❌ **违反** |
| **自动化等级** | AGENTS.md §6.2 — `automation.level.change` + AuditLog | ✅ 完全对齐 | ✅ |
| **团队管理** | AGENTS.md §6.1 — RBAC | ✅ WorkspaceMember + withRBAC | ✅ |

---

## 3. Monorepo 分层合规

| 检查项 | 合规? | 说明 |
|--------|-------|------|
| `apps/web` 不含纯业务规则 | ⚠️ | auth logic 内联在 route handler 中（可接受） |
| `packages/event-contracts` 有 billing/rewards 契约 | ❌ | **零定义** |
| `packages/hermes-kernel` 零 Prisma/Next.js 依赖 | ✅ | 仅编排逻辑 |
| 跨域通过 contracts 通信 | ⚠️ | billing/rewards 无跨域调用，但也没 contracts |
| 无 industryId 字面量 | ✅ | billing/rewards 不涉及 |
| Industry Pack 不侵入核心 | ✅ | billing/rewards 不在 pack 层 |

---

## 4. Contract-First 违规清单

以下功能有 API 路由 + 前端页面，但在 `packages/event-contracts/src/` 中**零类型定义**：

1. **Billing** — 7 个端点，无 `BillingOverview` / `StripeCheckoutRequest` / `InvoiceItem` 等类型
2. **Rewards** — 3 个端点，无 `RewardTask` / `InviteRecord` / `RewardLedgerEntry` 等类型
3. **Settings/Secrets** — 无 `SecretItem` / `CreateSecretRequest` 类型
4. **Settings/ApiKeys** — 无 `ApiKeyItem` / `CreateApiKeyRequest` 类型
5. **Settings/Preferences** — 无 `UserPreferences` 类型
6. **Settings/Security** — 无 `TwoFactorSetup` / `PasswordChangeRequest` 类型
7. **Settings/Profile** — 无 `SocialConnection` 类型

**这直接违反了 CLAUDE.md §2.2**: "所有跨域协作先定义 schema，再写 handler。"

---

## 5. 审计日志 (AuditLog) 覆盖缺口

AGENTS.md §6.2 / CLAUDE.md §8.1 要求以下行为必须写 AuditLog：

| 行为 | 当前是否记录 | 证据 |
|------|------------|------|
| `workflow.generate` | ✅ | 在 workflow 系统中 |
| `task.dispatch/cancel` | ✅ | 在 workflow 系统中 |
| `model.route` | ✅ | 在 model routing 中 |
| `connector.execute` (写操作) | ✅ | 在 connector 系统中 |
| `proposal.create/approve/reject/rollback` | ✅ | 在 harness 系统中 |
| `approval.requested/granted/rejected/expired` | ✅ | 在 approval 系统中 |
| `automation.level.change` | ✅ | `api/settings/automation-level/route.ts` |
| `industry.pack.install/activate/rollback` | ✅ | 在 pack 系统中 |
| **Auth: 密码修改** | ❌ | Mock 实现 |
| **Auth: 2FA 启用/禁用** | ❌ | Mock 实现 |
| **Billing: 套餐升级/降级** | ❌ | Mock 实现 |
| **Billing: 积分购买** | ❌ | Mock 实现 |
| **Rewards: 奖励发放** | ❌ | Mock 实现 |
| **Settings: Secret 创建/删除** | ❌ | 内存操作 |
| **Settings: API Key 创建/删除** | ❌ | 内存操作 |

**结论**: 所有真实实现的系统都已写 AuditLog，但 16 个 mock 模块完全缺失审计记录。

---

## 6. PRD 功能完成度矩阵

来自 PRD §9.2 MVP 必做清单：

| 功能 | PRD 要求 | 实现状态 | 完成度 |
|------|---------|---------|--------|
| Workspace + RBAC | MVP 必做 | ✅ withRBAC + 4 级角色 | 95% |
| AuditLog / AgentLog | MVP 必做 | ✅ 完整系统 | 90% |
| 风险等级 + 自动化 L1-L4 | MVP 必做 | ✅ 完整面板 | 100% |
| Harness 演化引擎 | MVP 必做 | ✅ 完整 Canary/Rollback | 100% |
| DAG 工作流引擎 | MVP 必做 | ✅ 完整编排 | 95% |
| 外贸领域数据 | MVP 必做 | ✅ Inquiry/Quotation 等 | 90% |
| **账户中心** | 未在 MVP 中作为独立模块 | 16/22 mock | **20%** |

**总结**: 账户中心在 PRD 中未被定义为独立 MVP 模块，但其作为 SaaS 基础设施的完整性严重不足。PRD 的治理内核（RBAC/AuditLog/Harness）已充分实现。
