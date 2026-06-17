# API Route 规范

> **版本**：v1.0
> **生效日期**：2026-06-17
> **强制级别**：硬性约束（违规 ESLint 报错，CI 失败）

---

## 1. 薄门卫原则

每个 `route.ts` 只做且仅做以下 4 件事：

1. **鉴权**：调用 `getServerSession` / `withRBAC` / `buildWorkspaceContext` 解析当前用户与工作空间。
2. **参数解析**：用 zod schema 校验请求体（仅结构校验，**不含业务规则**）。
3. **调用 service**：把已校验的纯数据 + 依赖（db / userId / workspaceId）传给 `@hermesclaw/*` 包或 `@/lib/server/*` 服务函数，单一职责。
4. **返回响应**：`Response.json()` / `successResponse()` / `ApiResponse.ok()`。

> **TL;DR**：路由是「门卫」，不是「业务房」。业务房在 `packages/hermes-kernel/` 与 `apps/web/src/lib/server/`。

---

## 2. 硬性约束

| 约束 | 阈值 | 检测手段 |
| --- | --- | --- |
| 文件行数上限 | **40 行**（含空行/注释由 ESLint `skipBlankLines` / `skipComments` 排除） | ESLint `max-lines` |
| 禁止 LLM prompt 拼装 | 任何 `system` / `user` / `assistant` 字面量出现在模板字符串 | ESLint `no-restricted-syntax` |
| 禁止数据库直接操作 | `prisma.xxx.findMany / create / update / delete` 等 | ESLint `no-restricted-syntax` |
| 禁止 fetch() 外部调用 | 应在 adapter / connector 层 | code review |
| 业务分支层数 | ≤ 2 层 if/else | code review |
| 置信度计算 / embedding | 一律下沉至 service | code review |

---

## 3. 正确示例（最佳实践模板）

### 3.1 单方法路由

```typescript
import { withRBAC } from "@/lib/server/api-handler"
import type { WorkspaceContext } from "@/lib/workspace"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { listInquiries, type InquiryHandlerDeps } from "@hermesclaw/hermes-kernel"
import { prisma } from "@/lib/prisma"

const deps: InquiryHandlerDeps = { prisma }

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const url = new URL(request.url)
    return successResponse(await listInquiries({
      workspaceId: ctx.workspaceId,
      priority: url.searchParams.get("priority") || undefined,
      page: Math.max(Number(url.searchParams.get("page")) || 1, 1),
      limit: Math.min(Number(url.searchParams.get("limit")) || 20, 500),
    }, deps))
  } catch { return errorResponse("服务器内部错误") }
}, "VIEWER")
```

### 3.2 多方法路由（GET/POST/PATCH/DELETE）

> 多方法路由若超 40 行，必须把每个方法的业务逻辑抽到 service 中：

```typescript
import { successResponse, errorResponse } from "@/lib/api-utils"
import { buildWorkspaceContext, requireWritable, ForbiddenError } from "@/lib/workspace"
import { z } from "zod"
import { validateBody } from "@/lib/server/validators"
import { patchProject, deleteProject, ProjectMutationError } from "@/lib/server/project-mutations"

const ProjectPatchSchema = z.object({ name: z.string().optional(), status: z.string().optional() })

function handleErr(e: unknown) {
  if (e instanceof ProjectMutationError) return errorResponse(e.message, e.httpStatus)
  if (e instanceof ForbiddenError) return errorResponse(e.message, 403)
  return errorResponse("服务器内部错误")
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role); const { id } = await params
    const parsed = validateBody(await request.json(), ProjectPatchSchema); if (parsed instanceof Response) return parsed
    return successResponse({ project: await patchProject(id, ctx.workspaceId, parsed) })
  } catch (e) { return handleErr(e) }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role); const { id } = await params
    return successResponse(await deleteProject(id, ctx.workspaceId))
  } catch (e) { return handleErr(e) }
}
```

---

## 4. 违规如何处理：业务逻辑下沉位置

按域分类，所有业务逻辑必须迁移至以下位置：

| 路由 | 迁移目标（首选） | 备选位置 |
| --- | --- | --- |
| `/api/task/*` | `packages/hermes-kernel/src/handlers/task-handler.ts` | — |
| `/api/chat/*` | `packages/hermes-kernel/src/handlers/chat-handler.ts` | — |
| `/api/brain/*` | `packages/hermes-kernel/src/handlers/brain-handler.ts` | — |
| `/api/dashboard/*` | `packages/hermes-kernel/src/handlers/dashboard-handler.ts` | — |
| `/api/harness/*` | `packages/hermes-kernel/src/handlers/harness-handler.ts` | `apps/web/src/lib/server/harness/*` |
| `/api/orchestration/*` | `packages/hermes-kernel/src/orchestration` | — |
| `/api/workflows/*` | `packages/hermes-kernel/src/handlers/workflow-handler.ts` | `apps/web/src/lib/server/workflow/*` |
| `/api/memory/*` | `packages/hermes-kernel/src/memory` | `apps/web/src/lib/server/memory-service.ts` / `memory-mutations.ts` |
| `/api/inquiries/*` | `packages/hermes-kernel/src/handlers/inquiry-handler.ts` | — |
| `/api/agents/*` | `packages/hermes-kernel/src/handlers/agent-handler.ts` | `apps/web/src/lib/server/agent-mutations.ts` / `agent-execute-service.ts` |
| `/api/connectors/*` | `packages/hermes-kernel/src/handlers/connector-handler.ts` | `apps/web/src/lib/server/connectors/*` / `connector-mutations.ts` |
| `/api/workspace/*` | `packages/hermes-kernel/src/handlers/workspace-handler.ts` | `apps/web/src/lib/server/workspace-member-service.ts` |
| `/api/approvals/*`（移动端） | `packages/hermes-kernel/src/harness/approval-service.ts` | `apps/web/src/lib/server/approval.ts` |
| `/api/reports/*` | `apps/web/src/lib/server/report-service.ts` | — |
| `/api/projects/*` | `apps/web/src/lib/server/project-service.ts` / `project-mutations.ts` | — |
| `/api/conversations/*` | `apps/web/src/lib/server/conversation-mutations.ts` | — |
| `/api/quotations/*` | `apps/web/src/lib/server/quotation-service.ts` | — |
| `/api/files/upload` | `apps/web/src/lib/server/file-upload-service.ts` | — |
| `/api/recent` | `apps/web/src/lib/server/recent-service.ts` | — |
| `/api/email-templates/*` | `apps/web/src/lib/server/email-template-service.ts` | — |
| `/api/tasks/*` | `apps/web/src/lib/server/task-mutations.ts` | — |

> **首选 hermes-kernel**：核心三域逻辑必须落在 `packages/hermes-kernel/`，确保未来可拆分为独立服务（CLAUDE.md §3.3）。
>
> **备选 lib/server**：行业无关 / 技术性 / Next.js 强耦合的服务（如 `report-service` 用到 `prisma` 直接绑定）可暂留 `apps/web/src/lib/server/`。

---

## 5. 函数签名规范（service 层）

所有迁移到 hermes-kernel 的函数必须遵循依赖注入：

```typescript
// 正确：DI 接口 + 纯数据输入
export async function handleXxx(
  input: XxxInput,            // zod 解析后的纯数据，无 Request 对象
  deps: {
    db: PrismaClient
    userId: string            // 从 session 提取后传入
    workspaceId: string
    [其他依赖]?: xxx
  }
): Promise<XxxOutput> { ... }

// 禁止：route 对象泄漏
export async function handleXxx(req: Request, session: Session) { ... }  // ❌
```

`apps/web/src/lib/server/*` 的服务可直接使用 `@/lib/prisma`、`@/lib/server/audit` 等单例（仅在 Next.js 服务端运行），但**仍需保持纯函数风格**：参数显式传 `workspaceId` / `actor`，不依赖 React/Next 全局状态。

---

## 6. 错误处理约定

`service` 应抛出自定义 `XxxServiceError(httpStatus, message, response?)`，路由层用统一 `handleErr` 函数捕获并转换为 HTTP 响应：

```typescript
export class FooServiceError extends Error {
  constructor(public readonly httpStatus: number, message: string, public readonly response?: Response) {
    super(message); this.name = "FooServiceError"
  }
}

// route 中
function handleErr(e: unknown) {
  if (e instanceof FooServiceError) return e.response ?? errorResponse(e.message, e.httpStatus)
  return errorResponse("服务器内部错误")
}
```

---

## 7. 禁止事项

- ❌ 不允许把逻辑移到同目录的 `_utils.ts` / `_helpers.ts` 文件再 import 回来（只是换地方放，不是真正下沉）。
- ❌ 不允许通过增加注释行/空行让行数"看起来少"（ESLint `skipBlankLines` / `skipComments` 已堵住此漏洞）。
- ❌ 不允许删除路由功能来降行。
- ❌ 不允许把多个路由合并成一个"超级路由"绕过行数检测。
- ❌ 不允许在 route.ts 中导入 `react` / `react-dom` / 任何 UI 组件。

---

## 8. 已合规的参考实现（按复杂度排序）

| 路由 | 行数 | 特征 |
| --- | --- | --- |
| `apps/web/src/app/api/health/route.ts` | 14 | 最小路由 |
| `apps/web/src/app/api/auth/[...nextauth]/route.ts` | 7 | 委托第三方处理器 |
| `apps/web/src/app/api/dashboard/stats/route.ts` | 17 | 直调 hermes-kernel handler |
| `apps/web/src/app/api/inquiries/route.ts` | 24 | GET + POST 双方法，全部下沉 |
| `apps/web/src/app/api/projects/[id]/route.ts` | 33 | GET + PATCH + DELETE 三方法 |
| `apps/web/src/app/api/memory/[id]/route.ts` | 39 | GET + PATCH + PUT + DELETE 四方法 |

---

## 9. 配套工具

- **ESLint 规则**：`eslint.config.mjs` 内置 `max-lines: 40` + `no-restricted-syntax`（详见根目录配置）。
- **运行 lint**：`pnpm lint` —— CI 与本地 pre-commit 钩子均会执行。
- **手动扫描**：`find apps/web/src/app/api -name "route.ts" | while read f; do l=$(wc -l < "$f"); [ "$l" -gt 40 ] && echo "$l $f"; done`
