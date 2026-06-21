# 高风险问题优先修复方案

**日期**: 2026-06-21
**目标**: 将账户中心从 mock 状态修复到可发布状态
**预计工作量**: 3-4 个 Sprint

---

## Phase 0: 立即修复（发布前必须完成）

### FIX-001: 移除 Turnstile 开发绕过 ✅ 低风险可直接改
- **风险**: C-001 (CRITICAL 积分) 的相关模式
- **文件**: `login/route.ts`, `register/route.ts`, `login/page.tsx`, `register/page.tsx`
- **方案**: 
  1. 删除 `"dev-token-bypass"` 硬编码检查
  2. 开发环境通过 `DEV_BYPASS_AUTH` 环境变量控制（已有该模式）
  3. 生产强制 Turnstile 验证
- **修改量**: ~20 行

### FIX-002: 关闭 `allowDangerousEmailAccountLinking`
- **风险**: M-010 (MAJOR)
- **文件**: `apps/web/src/lib/auth.ts` L38
- **方案**: 改为 `false` 或从环境变量读取
- **修改量**: 1 行

### FIX-003: 修复 Auth API Rate Limit
- **风险**: M-008 (MAJOR)
- **文件**: `login/route.ts`, `register/route.ts`, `forgot-password/route.ts`
- **方案**: 在每个 auth API handler 开头添加 `rateLimit()` 调用
- **修改量**: ~15 行

### FIX-004: 移除/重定向 /docs 死链接
- **风险**: M-004 (MAJOR)
- **文件**: `AccountMenu.tsx` L302
- **方案**: 将 `/docs` 改为指向 `https://hermesclaw.ai/docs` 或创建占位页面
- **修改量**: 2 行

### FIX-005: AUTH_SECRET 生产强制
- **风险**: C-004 (CRITICAL 相关)
- **文件**: `apps/web/src/lib/auth.ts` L33, `apps/web/src/lib/env.ts`
- **方案**: 移除后备值，在 `verifyRequiredEnv()` 加入 `AUTH_SECRET` 检查
- **修改量**: ~5 行

---

## Phase 1: 数据模型补齐（Sprint 1）

### FIX-101: 创建 Subscription + Invoice + PaymentMethod 模型
- **涉及**: Prisma schema migration + Billing API 重写 + Stripe 接入
- **新模型**:
```prisma
model Subscription {
  id String @id @default(cuid())
  userId String
  workspaceId String
  planId String // "free" | "pro" | "pro_plus" | "max" | "ultra"
  status String // "active" | "past_due" | "canceled"
  stripeSubscriptionId String?
  stripeCustomerId String?
  currentPeriodStart DateTime
  currentPeriodEnd DateTime
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Invoice {
  id String @id @default(cuid())
  userId String
  workspaceId String
  stripeInvoiceId String?
  amount Float
  currency String @default("usd")
  status String // "paid" | "open" | "void"
  invoiceDate DateTime
  invoicePdfUrl String?
  createdAt DateTime @default(now())
}

model PaymentMethod {
  id String @id @default(cuid())
  userId String
  stripePaymentMethodId String?
  brand String // "visa" | "mastercard" | etc
  last4 String
  expMonth Int
  expYear Int
  isDefault Boolean @default(false)
  createdAt DateTime @default(now())
}
```

### FIX-102: 创建 CreditLedger + RewardLedger + Invite 模型
```prisma
model CreditLedger {
  id String @id @default(cuid())
  userId String
  workspaceId String
  amount Float // 正=收入, 负=支出
  type String // "subscription" | "daily_reward" | "reward_task" | "invite_bonus" | "purchase" | "usage"
  description String
  referenceId String? // 关联 taskId / inviteId / invoiceId
  createdAt DateTime @default(now())
}

model RewardLedger {
  id String @id @default(cuid())
  userId String
  workspaceId String
  taskId String
  rewardType String
  points Int
  status String // "pending" | "awarded" | "rejected"
  awardedAt DateTime?
  createdAt DateTime @default(now())

  @@unique([userId, taskId]) // ← 去重：同一用户同一任务只能领取一次
}

model Invite {
  id String @id @default(cuid())
  inviterId String
  inviteeEmail String
  inviteCode String @unique
  status String // "pending" | "registered"
  pointsAwarded Int @default(0)
  createdAt DateTime @default(now())
  registeredAt DateTime?
}
```

### FIX-103: 创建 Secret + ApiKey + Preference 模型
```prisma
model Secret {
  id String @id @default(cuid())
  userId String
  workspaceId String?
  name String
  type String // "api_key" | "token" | "password"
  encryptedValue String // AES-256-GCM 加密
  scope String[] // ["read", "write", "admin", "execute"]
  lastUsedAt DateTime?
  createdAt DateTime @default(now())
}

model ApiKey {
  id String @id @default(cuid())
  userId String
  workspaceId String?
  name String
  prefix String // 存储前 12 字符用于显示
  hash String // bcrypt hash of full key
  permission String // "read" | "write" | "admin"
  expiresAt DateTime?
  lastUsedAt DateTime?
  createdAt DateTime @default(now())
}

model UserPreference {
  id String @id @default(cuid())
  userId String @unique
  theme String @default("dark")
  language String @default("zh-CN")
  defaultWorkspace String?
  notificationSettings Json?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## Phase 2: API 真实实现（Sprint 2）

### FIX-201: Stripe 集成
1. 安装 `stripe` npm 包
2. 创建 `apps/web/src/lib/stripe.ts` (Stripe 客户端单例)
3. 重写 `api/billing/checkout` → `stripe.checkout.sessions.create()`
4. 重写 `api/billing/portal` → `stripe.billingPortal.sessions.create()`
5. 创建 `api/billing/webhook` → 签名验证 + 事件处理
6. 重写 `api/billing/subscription` → 查询真实订阅状态
7. 重写 `api/billing/overview` → 聚合 Prisma + Stripe 数据

### FIX-202: 积分服务端实现
1. 创建 `apps/web/src/lib/server/credit-service.ts`
2. 重写 `api/rewards/tasks` → 查询 RewardLedger 去重 + 真实任务状态
3. 创建 `api/rewards/complete-task` → 服务端验证 + 写入 CreditLedger + AuditLog
4. 创建 `api/rewards/claim-daily` → 日期检查 + 去重
5. 废弃 `use-user.ts` (Zustand mock) → 改为 TanStack Query 查询真实数据

### FIX-203: 设置 API 真实实现
1. `api/settings/secrets` → Prisma CRUD + AES-256-GCM 加密 + AuditLog
2. `api/settings/api-keys` → Prisma CRUD + `crypto.randomUUID()` + bcrypt hash
3. `api/settings/preferences` → UserPreference 读写
4. `api/settings/security` → 真实 password change / TOTP (speakeasy/otplib)
5. `api/settings/profile` → OAuth 连接真实状态

### FIX-204: 忘记密码完整实现
1. 接入邮件服务（Resend/SendGrid）
2. 创建 `PasswordResetToken` 模型
3. 创建 `/api/auth/reset-password` 端点
4. 创建 `/reset-password` 页面
5. 加入 rate-limit

---

## Phase 3: 安全加固（Sprint 3）

### FIX-301: API Key 生成安全
- `Math.random()` → `crypto.getRandomValues()` / `crypto.randomUUID()`
- 密钥存储: 创建后立即 bcrypt hash，只存储 hash + 前缀

### FIX-302: CSRF 保护
- 为所有写操作 API 添加 CSRF token 验证
- 或使用 SameSite=Strict cookie 策略

### FIX-303: JWT 签名验证
- 目前 middleware 只 Base64 解码不验证签名
- 可在 API 层通过 `auth()` 重新验证（已有此机制）
- 文档化此设计决策

### FIX-304: Secret 加密存储
- 使用 AES-256-GCM 加密
- 加密密钥从环境变量读取（不在代码中）
- 明文只在创建时返回一次

### FIX-305: 生产环境变量强制
- `verifyRequiredEnv()` 添加: `AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`

---

## Phase 4: 测试补全（Sprint 3-4）

| 测试类型 | 目标数量 | 覆盖模块 |
|----------|---------|---------|
| Unit tests | 50+ | 所有新 service 层 |
| Integration tests | 20+ | Auth/Billing/Stripe webhook/Rewards |
| Playwright E2E | 10+ | 登录/注册/套餐切换/积分/语言/密码修改 |

---

## 工作量估计

| Phase | 描述 | 估时 | 优先级 |
|-------|------|------|--------|
| Phase 0 | 立即修复（5 项） | 2-4 小时 | **NOW** |
| Phase 1 | 数据模型迁移 | 2-3 天 | Sprint 1 |
| Phase 2 | API 真实实现 | 5-8 天 | Sprint 2 |
| Phase 3 | 安全加固 | 3-5 天 | Sprint 3 |
| Phase 4 | 测试补全 | 3-5 天 | Sprint 3-4 |
| **合计** | | **13-21 天** | |

---

## 可立即执行的修复（Phase 0）

以下修复风险低、改动小，建议现在立即执行：

1. ✏️ 删除 `"dev-token-bypass"` Turnstile 绕过
2. ✏️ 关闭 `allowDangerousEmailAccountLinking`
3. ✏️ 为 auth 端点添加 rate-limit
4. ✏️ 修复 /docs 死链接
5. ✏️ AUTH_SECRET 无后备值，启动时强制检查

是否需要我立即执行 Phase 0 的这 5 项修复？
