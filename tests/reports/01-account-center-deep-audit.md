# 账户中心深度审查报告 (Account Center Deep Audit Report)

**日期**: 2026-06-21
**审查范围**: HermesClaw v3.40 全量账户中心模块
**审查模式**: 发布前审计（无新功能开发）
**测试结果**: 83 tests passed / 5 files

---

## 1. 审查摘要

对 HermesClaw 项目账户中心以下模块进行了全量代码级审查 + 端到端链路验证：

| 模块 | 前端页面 | API 路由 | 数据模型 | 真实度 | 风险等级 |
|------|---------|---------|----------|--------|---------|
| 登录/注册 | ✅ 可用 | ✅ 真实 | ✅ User (Prisma) | 80% | **HIGH** |
| Google OAuth | ✅ 可用 | ✅ Auth.js v5 | ✅ Account (Prisma) | 70% | **HIGH** |
| Turnstile | ✅ 前端 | ✅ 服务端 | N/A | 60% | **MEDIUM** |
| 忘记密码 | ✅ UI完整 | ❌ **Mock** | ❌ 无 Token 表 | 10% | **CRITICAL** |
| 奖励中心 | ✅ UI完整 | ❌ **Mock** | ❌ 无 RewardLedger | 5% | **CRITICAL** |
| 邀请 | ✅ UI完整 | ❌ **Mock** | ❌ 无 Invite 模型 | 5% | **CRITICAL** |
| 积分系统 | ✅ UI显示 | ❌ **客户端** | ❌ 无 CreditLedger | 5% | **CRITICAL** |
| 套餐/升级 | ✅ UI完整 | ❌ **Mock** | ❌ 无 Subscription | 5% | **BLOCKER** |
| Stripe | ❌ 无集成 | ❌ **Mock URL** | ❌ 无依赖 | 0% | **BLOCKER** |
| 账单/发票 | ✅ UI完整 | ❌ **Mock PDF** | ❌ 无 Invoice | 5% | **BLOCKER** |
| 支付方式 | ✅ UI显示 | ❌ **Mock** | ❌ 无 PaymentMethod | 5% | **BLOCKER** |
| 用量图表 | ✅ 图表渲染 | ❌ **Math.sin** | ❌ 无查询 | 5% | **MAJOR** |
| 个人资料 | ✅ UI完整 | ❌ **Mock** | ❌ 无持久化 | 10% | **MAJOR** |
| 偏好设置 | ✅ UI完整 | ❌ **Echo** | ❌ 无 Preference | 10% | **MAJOR** |
| 语言切换 | ✅ 前端/菜单 | N/A (localStorage) | ❌ 无持久化 | 30% | **MINOR** |
| 安全/2FA | ✅ UI完整 | ❌ **Mock** | ❌ 无验证 | 5% | **CRITICAL** |
| 密钥管理 | ✅ UI完整 | ❌ **内存数组** | ❌ 无 Secret | 10% | **MAJOR** |
| API 密钥 | ✅ UI完整 | ❌ **内存数组** | ❌ 无 ApiKey | 10% | **MAJOR** |
| 自动化等级 | ✅ UI完整 | ✅ **真实！** | ✅ Workspace | 100% | LOW |
| 团队管理 | ✅ UI完整 | ✅ 真实 | ✅ WorkspaceMember | 95% | LOW |
| 账户菜单 | ✅ UI完整 | 混合 (Zustand) | ❌ 无持久化 | 20% | **MAJOR** |
| 文档/帮助 | ❌ **路由不存在** | ❌ 无 | ❌ 无 | 0% | **MAJOR** |

### 关键统计

- **总模块数**: 22
- **真实实现**: 5 (auth, team, automation-level)
- **完全 Mock**: 16
- **缺失数据模型**: 8 (Subscription, CreditLedger, RewardLedger, Invite, Invoice, PaymentMethod, Secret, ApiKey)
- **零 UI 页面**: 1 (docs)
- **零 Stripe 集成**: 全部 7 个 billing API

---

## 2. 模块详情

### 2.1 Auth（登录/注册/OAuth/Turnstile/忘记密码）

**登录 API** (`apps/web/src/app/api/auth/login/route.ts`):
- ✅ 真实 Zod 校验 + bcrypt 密码比对 + Prisma 查询
- ⚠️ Turnstile 绕过: `"dev-token-bypass"` 硬编码
- ⚠️ Turnstile Secret Key 后备: Cloudflare 公开测试 key
- ⚠️ 未使用 rate-limit

**注册 API** (`apps/web/src/app/api/auth/register/route.ts`):
- ✅ 真实 Zod 校验 + bcrypt hash + Prisma 写入
- ⚠️ 默认角色 `"member"` 硬编码
- ⚠️ bcrypt salt 10 轮固定
- ⚠️ Turnstile 绕过同 login

**Google OAuth** (`apps/web/src/lib/auth.ts`):
- ✅ Auth.js v5 + PrismaAdapter + JWT session
- ⚠️ `allowDangerousEmailAccountLinking: true` — 账户接管风险
- ⚠️ Client ID/Secret 后备值为 `"placeholder-*"`
- ⚠️ AUTH_SECRET 后备为固定字符串 → JWT 可预测

**忘记密码** (`apps/web/src/app/api/auth/forgot-password/route.ts`):
- ❌ **完全不工作**: 只 `console.log` 输出 mock URL
- ❌ 无邮件发送服务
- ❌ `/reset-password` 路由不存在
- ❌ 总是返回 `{ success: true }` — 欺骗性成功

**Middleware** (`apps/web/src/middleware.ts`):
- ✅ 页面门禁重定向 /login
- ✅ API 写操作返回 401
- ⚠️ JWT 解码不验证签名（纯 Base64 解码）
- ⚠️ 开发绕过: `DEV_BYPASS_AUTH` 放行 `/api/chat` 等

### 2.2 Billing（账单/Stripe/套餐/积分包/发票）

**全部 7 个 API 路由为纯 Mock，零 Stripe 集成，零数据库持久化：**

| 路由 | Mock 证据 |
|------|-----------|
| `api/billing/checkout` | 返回 `mock_session_hermesclaw_{planId}` — 无 Stripe SDK |
| `api/billing/subscription` | 总是返回 `planId: "free"` |
| `api/billing/overview` | 硬编码 Professional / $29 / Visa 4242 / 92% |
| `api/billing/credits/purchase` | 仅验证 `> 0`，返回 success — 无扣款 |
| `api/billing/portal` | 返回 `mock_hermesclaw_stripe_customer_portal` |
| `api/billing/usage` | `Math.sin` 生成 30 天假数据 |
| `api/billing/invoices/[id]/download` | 手写伪造 PDF 字符串 |

### 2.3 Rewards（奖励/积分/邀请）

**全部 3 个 API 路由为纯 Mock：**

| 路由 | Mock 证据 |
|------|-----------|
| `api/rewards/tasks` | 10 个硬编码任务，3 个标记完成 |
| `api/rewards/invites` | 6 个硬编码邀请记录 |
| `api/rewards/invite-link` | 硬编码 `hc_usr_99824` |

**积分安全风险：**
- 积分状态在 Zustand (`use-user.ts`) 中，客户端可直接修改
- 任务完成使用 `setTimeout(1000)` 模拟
- 积分发放无去重
- 初始积分 125 硬编码
- 所有用户看到相同数据

### 2.4 Settings（设置/安全/密钥）

| 子模块 | 状态 |
|--------|------|
| profile | Mock — 社交连接硬编码，头像上传模拟 |
| preferences | Echo — POST 只返回请求体 |
| security | Mock — 2FA 用 `MOCKSECRET1234567`，设备用假 IP |
| secrets | 内存数组 — 重启丢失，无加密存储 |
| api-keys | 内存数组 — `Math.random()` 生成（非安全） |
| automation-level | **唯一真实实现** — Prisma + RBAC + AuditLog |
| team | 真实 — Prisma WorkspaceMember |

---

## 3. 数据模型完整度

**Prisma Schema 43 个模型中，缺失 8 个账户中心所需模型：**

| 缺失模型 | 用途 | 影响 |
|----------|------|------|
| Subscription | 用户订阅状态 | 套餐无法持久化 |
| CreditLedger | 积分收支明细 | 积分无法审计 |
| RewardLedger | 奖励发放记录 | 奖励无法追溯 |
| Invite | 邀请记录 | 邀请归因不可行 |
| Invoice | 发票数据 | 发票历史无法查询 |
| PaymentMethod | 支付方式 | 支付方式无法管理 |
| Secret | 加密密钥存储 | 密钥无法安全存储 |
| ApiKey | API 密钥 | API 密钥重启丢失 |
| Preference | 用户偏好 | 偏好设置不持久化 |

---

## 4. 测试覆盖

**审计前**: 0 个账户中心相关测试
**审计后**: 新增 5 个测试文件 / 83 个测试用例

| 文件 | 测试数 | 覆盖模块 |
|------|--------|---------|
| `tests/unit/auth-api.test.ts` | 21 | 登录/注册/忘记密码/密码安全/Turnstile |
| `tests/unit/billing-mock.test.ts` | 12 | Billing API mock 检测/套餐价格/缺失模型 |
| `tests/unit/settings-security.test.ts` | 19 | Secrets/API Keys/Security/Preferences/Profile/Automation |
| `tests/unit/rewards-mock.test.ts` | 12 | Rewards API mock/积分安全/缺失模型 |
| `tests/integration/account-center-flow.test.ts` | 19 | 登录流程/注册流程/RBAC/Middleware/AuditLog |

**全部 83 个测试通过。**
