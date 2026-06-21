# 前后端真实联通验证报告

**日期**: 2026-06-21

---

## 验证方法

对账户中心每个模块，追踪从前端页面到数据库/第三方服务的完整数据流，验证实际执行路径。

---

## 1. Auth 模块联通验证

### 1.1 登录流程

```
[前端] LoginPage (client)
  → POST /api/auth/login
    → Zod 校验 ✅
    → Turnstile 验证 ✅ (Cloudflare API, 或 dev bypass)
    → prisma.user.findUnique({email}) ✅ (真实 DB)
    → bcrypt.compare(password, hash) ✅ (真实比对)
    → return {success, user}
  → signIn("credentials") ✅ (Auth.js v5)
    → authorize() 回调 → 再次 DB+bcrypt ✅
    → JWT 签名 → Set-Cookie ✅
  → router.push("/new") ✅
```

**联通结果**: ✅ **连通** — 完整链路可运行

### 1.2 Google OAuth 流程

```
[前端] signIn("google")
  → 重定向 Google OAuth consent ✅
  → /api/auth/callback/google
    → Auth.js + PrismaAdapter → upsert Account/User ✅
    → JWT 签名 → Set-Cookie ✅
  → redirect /new ✅
```

**联通结果**: ⚠️ **部分连通** — 开发环境可用，生产需真实凭据

### 1.3 注册流程

```
[前端] RegisterPage (client)
  → POST /api/auth/register
    → Zod 校验 + 密码一致性 ✅
    → Turnstile 验证 ✅
    → 邮箱唯一性检查 ✅ (prisma.user.findUnique)
    → bcrypt.hash(password, 10) ✅
    → prisma.user.create ✅ (真实写入)
    → return {success, user}
  → signIn("credentials") ✅
  → router.push("/onboarding") ✅
```

**联通结果**: ✅ **连通** — 用户可真实创建

### 1.4 忘记密码流程

```
[前端] ForgotPasswordPage (client)
  → POST /api/auth/forgot-password
    → Zod 校验邮箱 ✅
    → prisma.user.findUnique ✅ (查用户)
    → console.log(mockUrl) ❌ 不发送邮件
    → return {success} ❌ 欺骗性成功
  → 显示"邮件已发送" ❌ 实际上未发送
  → /reset-password?token=... ❌ 路由 404
```

**联通结果**: ❌ **断链** — `console.log` → 无邮件服务 → 无 reset 页面

---

## 2. Billing 模块联通验证

### 2.1 套餐升级流程

```
[前端] BillingPlansPage
  → POST /api/billing/checkout {planId, interval}
    → 仅校验 planId/interval 存在 ❌
    → return mock URL ❌ 无 Stripe Session
  → 页面收到 mock URL → window.open 跳转 ❌ 跳转到假地址
```

**联通结果**: ❌ **完全断链** — 无 Stripe SDK，所有 7 个端点返回 mock

### 2.2 Billing 数据流全景

```
用户操作 → fetch(/api/billing/*) → 硬编码 JSON ← 这就是全部
                                       ↑
                                  零数据库查询
                                  零 Stripe API 调用
                                  零 webhook 处理
```

---

## 3. Rewards 模块联通验证

### 3.1 积分发放流程

```
[前端] RewardsPage
  → 用户点击"完成任务"
  → setTimeout(1000) ❌ 模拟延迟
  → queryClient.setQueryData ❌ 仅前端乐观更新
  → setPoints(points + reward) ❌ Zustand 直接操作
  → toast.success("恭喜！") ❌ 实际上服务器不知道
```

**联通结果**: ❌ **完全客户端操作** — 无任何服务端交互

### 3.2 邀请流程

```
[前端] RewardsPage (invites tab)
  → GET /api/rewards/invite-link → 硬编码 URL ❌
  → GET /api/rewards/invites → 6 条硬编码记录 ❌
  → 不查询数据库 ❌
  → 不关联当前用户 ❌
```

---

## 4. Settings 模块联通验证

### 4.1 真实联通（仅 automation-level）

```
[前端] AutomationPage
  → PATCH /api/settings/automation-level
    → withRBAC("OWNER") ✅ 角色门禁
    → 令牌校验 (L3/L4) ✅
    → prisma.workspace.update ✅ 真实写入
    → writeAuditLog ✅ 审计留痕
  → 返回更新后的 automationLevel ✅
```

**联通结果**: ✅ **连通** — 唯一真实实现的 Settings API

### 4.2 断开链接（所有其他 Settings API）

| API | 链路 | 数据库? |
|-----|------|---------|
| `/api/settings/secrets` | 内存数组 → echo | ❌ |
| `/api/settings/api-keys` | 内存数组 → echo | ❌ |
| `/api/settings/preferences` | echo body | ❌ |
| `/api/settings/security` | 硬编码响应 | ❌ |
| `/api/settings/profile` | 硬编码响应 | ❌ |

---

## 5. 账户菜单联通验证

```
[前端] AccountMenu
  → useSession() ✅ 真实登录状态
  → useUser() ❌ Zustand 硬编码 (125 分, free 套餐)
  → /docs 链接 ❌ 路由不存在
  → 语言切换 localStorage ✅ 但无服务端持久化
```

**联通结果**: ⚠️ **部分联通** — 登录状态真实，积分/套餐数据不真实

---

## 6. 联通验证总结

| 状态 | 模块数 | 说明 |
|------|--------|------|
| ✅ 真实连通 | 3 | login, register, automation-level |
| ⚠️ 部分连通 | 3 | Google OAuth, team, account-menu |
| ❌ 断链/Mock | 16 | 所有 billing, rewards, settings (除 automation), forgot-password, docs |

**总评**: 账户中心 22 个模块中，仅 3 个有真实端到端连通（14%），剩余 19 个（86%）为 mock/placeholder 或完全断链。
