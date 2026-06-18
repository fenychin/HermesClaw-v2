# TECH_DEBT.md — HermesClaw 技术债务登记

> 本文件记录已知但暂未修复的技术债务，每条须包含 **位置 / 类型 / 风险 / 修复计划日期**。
> 修复后请从此文件移除（或归档至 `docs/tech-debt-archive.md`）。

---

## v3.19 (2026-06-17)

### TD-2026-06-17-001 — generateHarnessSpec 仍是占位实现 ✅ RESOLVED (2026-06-18, v3.20)

- **位置**：`apps/web/src/lib/server/harness/harness-spec-generator.ts`
- **类型**：占位 / 功能未完整实现
- **风险**：低（API 路由可编译通过，但 Spec 内容缺乏真实 LLM 路由与知识检索）
- **背景**：v3.19 重构期为补齐路由层 TSC 编译，临时新增了一个回显式占位 generator。
  真实实现应迁入 Hermes Kernel，含模型路由、行业包知识检索、风险评估。
- **解决方案**：
  - 替换为 deps 注入式真实实现（`prisma` + `callLlm`），与 `runHarnessEvaluation` 一致。
  - 加入 DB 上下文检索：工作空间 active Skill / available Connector / 近期 EvolutionLog。
  - LLM 输出严格 JSON 解析（围栏/裸字符串/片段三级容错），失败兜底为基于 DB 的合法 Spec。
  - `version` 升级至 `1.0.0`；`recommendedAutomationLevel` / `boundaries` / `requiredSkills` /
    `requiredConnectors` 全部纳入返回结构。
- **修复完成日期**：2026-06-18

### TD-2026-06-17-002 — Workspace Member 主键模型与 UI 字段不一致 ✅ RESOLVED (2026-06-18, v3.20)

- **位置**：
  - `apps/web/src/lib/server/workspace-member-service.ts`
  - `prisma/schema.prisma#WorkspaceMember`
- **类型**：数据模型 / 字段缺失
- **风险**：中（前端期望 `member.id` / `member.createdAt` / `user.image`，后端目前以 `${workspaceId}:${userId}` 拼接 id，并将 `createdAt` 置 null）
- **背景**：WorkspaceMember 使用复合主键且无 createdAt/User.image 列。
  v3.19 编译期改造避开了字段访问，但 UI 层仍存在期望差异。
- **解决方案**（仅覆盖 WorkspaceMember 侧；`User.image` 单独追踪——见 TD-2026-06-18-005）：
  - schema：新增 `id String @id @default(cuid())` 与 `createdAt DateTime @default(now())`；
    复合主键 `@@id([workspaceId, userId])` 改为 `@@unique([workspaceId, userId])`；
    补 `(workspaceId)` / `(userId)` 单列索引。
  - 迁移：`prisma/migrations/20260618120000_fix_workspace_member_pk/migration.sql`
    使用 SQLite 标准「新表 + 数据回填 + 替换」重建，旧行 id 用 `lower(hex(randomblob(12)))` 回填。
  - 服务层：`workspace-member-service.ts` 完全重写，删除 `${workspaceId}:${userId}` 拼接，
    `id` / `createdAt` 直接来自 DB；`audit.targetId` 改用真实 id。
  - 路由、`packages/hermes-kernel/src/handlers/workspace-handler.ts` 现已与 DB 字段对齐。
- **验证**：`prisma validate` ✅ / `tsc --noEmit` (apps/web + hermes-kernel) ✅ / dev.db 升级后保留原成员行。
- **修复完成日期**：2026-06-18

### TD-2026-06-18-005 — User.image 字段缺失（从 TD-002 拆分）

- **位置**：`prisma/schema.prisma#User`
- **类型**：数据模型 / 字段缺失
- **风险**：低（前端展示头像降级为占位符即可，不影响成员管理）
- **背景**：原 TD-002 提到前端期望 `user.image`，但 next-auth User 模型未含此列；
  本仓库 v3.20 修复 TD-002 时仅覆盖 WorkspaceMember 侧，User 模型按当前任务约束不动。
- **修复计划日期**：2026-07-01（与 next-auth 升级 / 用户头像上传通道一并处理）

### TD-2026-06-17-003 — Report 模型缺 title / createdBy 字段

- **位置**：
  - `apps/web/src/lib/server/report-service.ts`
  - `prisma/schema.prisma#Report`
- **类型**：数据模型 / 字段缺失
- **风险**：低（写入路径已删除字段，但响应仍返回 `title` 字符串，前端展示 OK 但与库内不一致）
- **背景**：Report schema 不含 title / createdBy 列；service 层写库时已剥离这些字段。
- **修复计划日期**：2026-07-01（迁移：补 title / createdBy 列 → 回填默认值）

### TD-2026-06-17-004 — startWorkflowRun envelope 通过 inputContext 传递

- **位置**：`apps/web/src/lib/server/workflow-run-starter.ts`
- **类型**：API 形态过渡
- **风险**：低（绕道 inputContext 携带 envelope，类型上以 `as any` 过编译）
- **背景**：runtime-engine 的 `startWorkflowRun` 不接受顶层 `input/envelope` 字段；
  当前用 `inputContext.envelope` 作为兼容路径。
- **修复计划日期**：2026-07-15（v3.20：runtime-engine 暴露 `dispatchEnvelope` 直通 API）
