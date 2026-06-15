import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC, type RouteContext } from '@/lib/server/api-handler'
import { checkConfirmQuery } from '@/lib/server/guardrail'
import { prisma } from '@/lib/prisma'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'

const UpdateTemplateSchema = z.object({
  name: z.string().optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  variables: z.array(z.string()).optional(),
  category: z.enum(['transactional', 'marketing', 'notification', 'alert']).optional()
})

// GET /api/email-templates/[id]
// 获取特定模板详情 (支持主键 id 或 templateId)
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    try {
      const { id } = await routeCtx.params
      const template = await prisma.emailTemplate.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          OR: [
            { id },
            { templateId: id }
          ]
        }
      })

      if (!template) {
        return ApiResponse.error('模板不存在', 404)
      }

      return ApiResponse.ok(template)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'VIEWER'
)

// PATCH /api/email-templates/[id]
// 更新模板，使 version 递增
export const PATCH = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    try {
      const { id } = await routeCtx.params
      const body = await request.json()
      
      const parsed = UpdateTemplateSchema.safeParse(body)
      if (!parsed.success) {
        return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
      }

      const template = await prisma.emailTemplate.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          OR: [
            { id },
            { templateId: id }
          ]
        }
      })

      if (!template) {
        return ApiResponse.error('模板不存在', 404)
      }

      const input = parsed.data
      const bodyText = input.bodyText || (input.bodyHtml ? input.bodyHtml.replace(/<[^>]*>/g, '').trim() : undefined)

      const updated = await prisma.emailTemplate.update({
        where: { id: template.id },
        data: {
          name: input.name ?? undefined,
          subject: input.subject ?? undefined,
          bodyHtml: input.bodyHtml ?? undefined,
          bodyText: bodyText ?? undefined,
          variables: input.variables ? JSON.stringify(input.variables) : undefined,
          category: input.category ?? undefined,
          version: template.version + 1
        }
      })

      return ApiResponse.ok(updated)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'MEMBER'
)

// DELETE /api/email-templates/[id]
// 归档模板 (逻辑软删除)
export const DELETE = withRBAC(
  async (request: Request, ctx: WorkspaceContext, routeCtx: RouteContext<{ id: string }>) => {
    try {
      const { id } = await routeCtx.params

      // 1. 高危操作防线：校验 query 里的 ?confirm=true
      const guard = await checkConfirmQuery(request, '归档邮件模板属于高危操作，需要二次确认')
      if (!guard.ok) {
        return guard.response
      }

      const template = await prisma.emailTemplate.findFirst({
        where: {
          workspaceId: ctx.workspaceId,
          OR: [
            { id },
            { templateId: id }
          ]
        }
      })

      if (!template) {
        return ApiResponse.error('模板不存在', 404)
      }

      const archived = await prisma.emailTemplate.update({
        where: { id: template.id },
        data: {
          status: 'archived'
        }
      })

      return ApiResponse.ok(archived)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'MEMBER'
)
