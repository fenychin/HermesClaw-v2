import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { prisma } from '@/lib/prisma'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'

const CreateTemplateSchema = z.object({
  templateId: z.string().min(1, '必须提供模板唯一标识'),
  name: z.string().min(1, '模板名称不能为空'),
  subject: z.string().min(1, '邮件主题不能为空'),
  bodyHtml: z.string().min(1, '邮件 HTML 内容不能为空'),
  bodyText: z.string().optional(),
  variables: z.array(z.string()).optional(),
  category: z.enum(['transactional', 'marketing', 'notification', 'alert']).optional()
})

// GET /api/email-templates
// 获取当前工作空间的模板列表
export const GET = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const { searchParams } = new URL(request.url)
      const category = searchParams.get('category') || undefined
      const status = searchParams.get('status') || 'active'

      const templates = await prisma.emailTemplate.findMany({
        where: {
          workspaceId: ctx.workspaceId,
          ...(category ? { category } : {}),
          status
        },
        orderBy: { updatedAt: 'desc' }
      })

      return ApiResponse.ok(templates)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'VIEWER'
)

// POST /api/email-templates
// 创建新模板
export const POST = withRBAC(
  async (request: Request, ctx: WorkspaceContext) => {
    try {
      const body = await request.json()
      const parsed = CreateTemplateSchema.safeParse(body)
      if (!parsed.success) {
        return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
      }

      const input = parsed.data

      // 检查唯一性
      const existing = await prisma.emailTemplate.findUnique({
        where: { templateId: input.templateId }
      })
      if (existing) {
        return ApiResponse.error(`模板标识已存在: ${input.templateId}`, 409)
      }

      const bodyText = input.bodyText || input.bodyHtml.replace(/<[^>]*>/g, '').trim()

      const created = await prisma.emailTemplate.create({
        data: {
          templateId: input.templateId,
          workspaceId: ctx.workspaceId,
          name: input.name,
          subject: input.subject,
          bodyHtml: input.bodyHtml,
          bodyText,
          variables: JSON.stringify(input.variables || []),
          category: input.category || 'transactional',
          status: 'active',
          version: 1,
          createdBy: ctx.userId || 'system'
        }
      })

      return ApiResponse.ok(created)
    } catch (error) {
      const msg = error instanceof Error ? error.message : '未知错误'
      return ApiResponse.error(msg, 500)
    }
  },
  'MEMBER'
)
