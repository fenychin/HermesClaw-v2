# 账户中心缺陷 Backlog

**日期**: 2026-06-21 | **范围**: 账户中心全模块

---

## BLOCKER（阻塞发布 / 不可上线）

### B-001: Stripe 集成完全缺失
- **模块**: Billing
- **严重级别**: BLOCKER
- **问题描述**: 全部 7 个 billing API 路由返回 mock 数据，无 Stripe SDK 依赖，无 Stripe API Key 配置，无 webhook handler
- **证据**: 
  - `apps/web/src/app/api/billing/checkout/route.ts` — 返回 mock URL
  - `apps/web/src/app/api/billing/portal/route.ts` — 返回 mock URL
  - 无 `stripe` npm 包依赖
- **复现**: 调用任何 billing API → 返回硬编码 mock 数据
- **预期**: 真实 Stripe Checkout Session / Customer Portal 创建
- **实际**: 返回 `mock_session_hermesclaw_*` 字符串
- **修复建议**: 接入 Stripe SDK，创建 webhook 端点，实现签名验证
- **涉及文件**: `apps/web/src/app/api/billing/**/*.ts`（7 个文件）

### B-002: 忘记密码完全不可用
- **模块**: Auth
- **严重级别**: BLOCKER
- **问题描述**: API 只 `console.log` 输出 mock URL，无邮件服务，`/reset-password` 路由不存在
- **证据**: `apps/web/src/app/api/auth/forgot-password/route.ts` L31-39, L41-44
- **复现**: 输入邮箱 → 总是显示"邮件已发送"→ 无邮件收到
- **预期**: 发送真实重置邮件，`/reset-password?token=...` 可正常重置
- **实际**: console.log 模拟，路由 404
- **修复建议**: 接入邮件服务（Resend/SendGrid），创建 reset-password 页面和 API

### B-003: Google OAuth 生产配置不完整
- **模块**: Auth
- **严重级别**: BLOCKER
- **问题描述**: `GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 后备值为 `"placeholder-*"`，生产环境无法正常 Google 登录
- **证据**: `apps/web/src/lib/auth.ts` L36-37
- **复现**: 未设环境变量时 → Google 登录失败
- **预期**: 环境变量验证，缺少时启动失败或明确报错
- **修复建议**: 在 `env.ts` 添加必需环境变量检查，移除 placeholder 后备值

---

## CRITICAL（严重缺陷 / 安全风险）

### C-001: 积分系统全部在客户端操作 — 可无限刷取
- **模块**: Rewards
- **严重级别**: CRITICAL
- **问题描述**: 积分状态在 Zustand store，任务完成在 `setTimeout` 模拟，无服务端验证、无去重
- **证据**: 
  - `apps/web/src/hooks/use-user.ts` L16-35
  - `apps/web/src/app/rewards/page.tsx` L98-118
- **复现**: 打开 DevTools → 修改 Zustand store → 积分任意数值
- **预期**: 服务端验证任务完成、防重、写入 CreditLedger
- **实际**: 客户端 `setPoints(points + reward)` 无任何服务端校验

### C-002: 2FA/MFA 完全 Mock — 无真实验证
- **模块**: Settings/Security
- **严重级别**: CRITICAL
- **问题描述**: TOTP secret 硬编码 `MOCKSECRET1234567`，修改密码/登出设备均不操作数据库
- **证据**: `apps/web/src/app/api/settings/security/route.ts` L29, L22-23, L42-48
- **复现**: 修改密码 → 返回 success → 数据库密码未变
- **预期**: 真实密码修改、TOTP 启用/验证、Session 撤销
- **实际**: 全部返回假成功

### C-003: API Key 使用非安全随机数生成
- **模块**: Settings/API Keys
- **严重级别**: CRITICAL
- **问题描述**: `Math.random()` 不是 CSPRNG，密钥可被预测
- **证据**: `apps/web/src/app/api/settings/api-keys/route.ts` L23
- **修复建议**: 使用 `crypto.randomUUID()` 或 `crypto.getRandomValues()`

### C-004: JWT Session Token 签名不被 Middleware 验证
- **模块**: Auth/Middleware
- **严重级别**: CRITICAL
- **问题描述**: middleware 只做 Base64 URL 解码提取 role，不验证 HMAC 签名
- **证据**: `apps/web/src/middleware.ts` L54-65
- **复现**: 伪造 JWT payload 中 role=admin → middleware 放行
- **预期**: 验证签名或在 API 层二次验证（withRBAC）
- **实际**: 仅 Base64 解码，任何人都可伪造任意角色

### C-005: 积分发放无去重 — 可无限重复领取
- **模块**: Rewards
- **严重级别**: CRITICAL
- **问题描述**: 同一任务可被多次"完成"，每次增加积分
- **证据**: `apps/web/src/app/rewards/page.tsx` L98-118
- **复现**: 多次点击任务完成按钮 → 积分累加无限制
- **预期**: 服务端记录已完成任务 ID，拒绝重复
- **实际**: 客户端 `setQueryData` 乐观更新，无服务端去重

### C-006: 缺失 Workspace 隔离 — 所有用户看到相同 mock 数据
- **模块**: Billing/Rewards/Settings
- **严重级别**: CRITICAL
- **问题描述**: 所有 mock API 返回的硬编码数据与当前登录用户无关
- **证据**: 所有 billing/rewards/settings API route 文件
- **复现**: 用户 A 登录 → 看到 Professional 套餐；用户 B 登录 → 同样看到 Professional 套餐
- **预期**: 每个用户自己的订阅/积分/设置

---

## MAJOR（重要缺陷）

### M-001: Secrets 存储在内存数组 — 重启丢失 + 无加密
- **模块**: Settings/Secrets
- **证据**: `apps/web/src/app/api/settings/secrets/route.ts` L4-7
- **修复建议**: 创建 Secret Prisma 模型，加密存储 (AES-256-GCM)

### M-002: Preferences 只 Echo — 不持久化
- **模块**: Settings/Preferences
- **证据**: `apps/web/src/app/api/settings/preferences/route.ts` L23-29
- **修复建议**: 创建 Preference 模型，或扩展现有 WorkspaceSettings

### M-003: 语言仅存 localStorage — 无服务端持久化
- **模块**: Account Menu
- **证据**: `apps/web/src/components/layout/AccountMenu.tsx` L128
- **修复建议**: 服务端存储语言偏好，或在 cookie 中持久化

### M-004: 文档/帮助中心路由不存在
- **模块**: Docs
- **证据**: Glob 扫描 `apps/web/src/app/docs/` 返回空；`AccountMenu.tsx` L302 链接到 `/docs`
- **修复建议**: 创建文档页面或移除链接

### M-005: 用量图表使用 `Math.sin` 生成假数据
- **模块**: Billing/Usage
- **证据**: `apps/web/src/app/api/billing/usage/route.ts` L10-11
- **修复建议**: 基于实际 API 调用量或积分消费记录生成

### M-006: 邀请链接硬编码为固定值
- **模块**: Rewards/Invite
- **证据**: `apps/web/src/app/api/rewards/invite-link/route.ts` L4-7
- **修复建议**: 基于用户 ID 生成唯一邀请码

### M-007: Secret 明文在 HTTP 响应中传输
- **模块**: Settings/Secrets
- **证据**: `apps/web/src/app/api/settings/secrets/route.ts` L34-38
- **修复建议**: 创建后立即哈希存储，只返回一次明文（或使用 E2E 加密）

### M-008: 无 Rate Limit 保护 Auth API
- **模块**: Auth
- **证据**: `apps/web/src/lib/rate-limit.ts` 已实现但未在 auth 端点使用
- **修复建议**: login/register/forgot-password 添加 `rateLimit()` 调用

### M-009: 发票下载返回手写伪造 PDF
- **模块**: Billing/Invoices
- **证据**: `apps/web/src/app/api/billing/invoices/[id]/download/route.ts` L10-45
- **修复建议**: 集成真实 PDF 生成库或 Stripe Invoice API

### M-010: `allowDangerousEmailAccountLinking` 开启
- **模块**: Auth/Google OAuth
- **证据**: `apps/web/src/lib/auth.ts` L38
- **修复建议**: 生产环境应关闭，要求用户显式关联账户

---

## MINOR（低风险）

### MN-001: `bcrypt` salt rounds 硬编码为 10
- **模块**: Auth/Register
- **证据**: `apps/web/src/app/api/auth/register/route.ts` L69
- **修复建议**: 从环境变量读取

### MN-002: 默认用户角色硬编码为 `"member"`
- **模块**: Auth/Register
- **证据**: `apps/web/src/app/api/auth/register/route.ts` L76
- **修复建议**: 通过参数化或配置决定

### MN-003: 2FA QR Code 使用外部 qrserver.com API
- **模块**: Settings/Security
- **修复建议**: 服务端生成 QR 码或使用客户端库

### MN-004: 设备列表显示假 IP 和假地理位置
- **模块**: Settings/Security
- **证据**: `apps/web/src/app/api/settings/security/route.ts` L8-11

### MN-005: Turnstile 测试 Key 后备值
- **模块**: Auth
- **证据**: login/register route.ts 中 `"1x0...AA"` 为 Cloudflare 公开测试 key

### MN-006: 套餐名称和徽章映射硬编码在 AccountMenu 中
- **模块**: Account Menu
- **证据**: `apps/web/src/components/layout/AccountMenu.tsx` L149-156

---

## 总计

| 级别 | 数量 |
|------|------|
| BLOCKER | 3 |
| CRITICAL | 6 |
| MAJOR | 10 |
| MINOR | 6 |
| **总计** | **25** |
