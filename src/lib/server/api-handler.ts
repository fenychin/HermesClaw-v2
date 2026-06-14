/**
 * 统一 RBAC 守卫高阶函数（AGENTS.md §4.11 多租户 RBAC / §4.5 安全护栏）
 *
 * —— 为写操作路由（POST/PUT/DELETE）提供统一的角色门禁：
 *    1. 构建 workspace 上下文（仅调用一次 auth()）
 *    2. 校验当前角色是否满足 requiredRole（VIEWER < MEMBER < ADMIN < OWNER）
 *    3. 不满足 → 写 AuditLog(action='RBAC_DENIED') 并返回 403
 *    4. 满足 → 将已解析的 ctx 注入业务 handler，避免重复构建上下文
 *
 * 角色比较复用 workspace.ts 的 hasMinRole，审计写入复用 audit.ts 的 writeAuditLog，
 * 不在此重复实现（CLAUDE.md §9 防重复逻辑）。
 */
import { prisma } from "@/lib/prisma"
import {
  buildWorkspaceContext,
  hasMinRole,
  type WorkspaceContext,
  type WorkspaceRole,
} from "@/lib/workspace"
import { writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { logger } from "@/lib/logger"
import { AppException } from "@/lib/server/exceptions"

/**
 * Next.js 动态路由参数上下文（App Router 第二参形态）。
 * —— 统一各路由 `{ params: Promise<{...}> }` 的声明，避免在每个路由重复定义。
 */
export type RouteContext<P = Record<string, string>> = {
  params: Promise<P>
}

/**
 * 受 RBAC 保护的业务 handler 签名。
 * —— 第二参为已解析的 workspace 上下文（含 workspaceId / role / userId）。
 * —— 第三参透传 Next.js 动态路由参数（如 `{ params }`），保证 `[id]` 可用。
 */
export type RbacHandler<C> = (
  request: Request,
  ctx: WorkspaceContext,
  routeContext: C,
) => Promise<Response> | Response

/**
 * 包裹一个写操作 Route Handler，强制 RBAC 角色门禁。
 *
 * @param handler 业务处理函数，仅在角色校验通过后执行
 * @param requiredRole 该路由要求的最低角色
 * @returns 标准 Next.js Route Handler
 *
 * @example
 *   export const POST = withRBAC(async (req, ctx) => { ... }, "MEMBER")
 */
export function withRBAC<C = unknown>(
  handler: RbacHandler<C>,
  requiredRole: WorkspaceRole,
): (request: Request, routeContext: C) => Promise<Response> {
  return async (request: Request, routeContext: C): Promise<Response> => {
    // 上下文构建本身亦纳入错误处理：buildWorkspaceContext 内部已降级返回 VIEWER，
    // 但仍兜底捕获意外异常，避免 Policy Engine 链路首环静默抛出。
    let ctx: WorkspaceContext
    try {
      ctx = await buildWorkspaceContext(request)
    } catch (error) {
      logger.error("[withRBAC] 构建 workspace 上下文失败", {
        path: new URL(request.url).pathname,
        method: request.method,
        error: error instanceof Error ? error.message : "未知错误",
      })
      return Response.json(
        { success: false, error: "服务器内部错误" },
        { status: 500 },
      )
    }

    if (!hasMinRole(ctx.role, requiredRole)) {
      // 拒绝也必须可溯源（§4.3 无日志禁止静默执行）
      // —— 附带 contextSnapshot 记录拒绝上下文
      await writeAuditLog({
        actor: await actorFromSession(),
        action: "RBAC_DENIED",
        targetType: "rbac",
        targetId: new URL(request.url).pathname,
        detail: `角色 ${ctx.role} 不满足最低要求 ${requiredRole}（${request.method}）`,
        riskLevel: "medium",
        workspaceId: ctx.workspaceId,
      })
      // 同时写入带增强字段的审计（AGENTS.md §1.2 数据主权）
      try {
        await prisma.auditLog.create({
          data: {
            actor: await actorFromSession(),
            action: "RBAC_DENIED",
            targetType: "rbac",
            targetId: new URL(request.url).pathname,
            detail: `角色 ${ctx.role} 不满足最低要求 ${requiredRole}（${request.method}）`,
            riskLevel: "medium",
            workspaceId: ctx.workspaceId,
            contextSnapshot: {
              currentRole: ctx.role,
              requiredRole,
              method: request.method,
              path: new URL(request.url).pathname,
            },
            automationLevel: "L1",
            triggeredBy: "user",
            status: "success",
          },
        })
      } catch {
        // 静默吞错，不阻断 RBAC 拒绝响应
      }

      return Response.json(
        {
          success: false,
          error: "RBAC_DENIED",
          message: `权限不足，需要 ${requiredRole} 或更高角色`,
        },
        { status: 403 },
      )
    }

    try {
      return await handler(request, ctx, routeContext)
    } catch (error) {
      if (error instanceof AppException) {
        return Response.json(
          {
            success: false,
            error: error.message,
            code: error.errorCode,
            details: error.details,
          },
          { status: error.httpStatus }
        )
      }

      logger.error("[withRBAC] 业务 handler 执行失败", {
        path: new URL(request.url).pathname,
        method: request.method,
        error: error instanceof Error ? error.message : "未知错误",
      })
      return Response.json(
        { success: false, error: "服务器内部错误" },
        { status: 500 },
      )
    }
  }
}
