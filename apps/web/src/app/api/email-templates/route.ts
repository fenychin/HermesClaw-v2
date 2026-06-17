import { ApiResponse } from '@/lib/server/api-response'
import { withRBAC } from '@/lib/server/api-handler'
import { prisma } from '@/lib/prisma'
import type { WorkspaceContext } from '@/lib/workspace'
import { z } from 'zod'

const CreateTemplateSchema = z.object({ templateId: z.string().min(1), name: z.string().min(1), subject: z.string().min(1), bodyHtml: z.string().min(1), bodyText: z.string().optional(), variables: z.array(z.string()).optional(), category: z.enum(['transactional', 'marketing', 'notification', 'alert']).optional() })

export const GET = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const { searchParams } = new URL(request.url)
    const templates = await prisma.emailTemplate.findMany({ where: { workspaceId: ctx.workspaceId, ...(searchParams.get('category') ? { category: searchParams.get('category')! } : {}), status: searchParams.get('status') || 'active' }, orderBy: { updatedAt: 'desc' } })
    return ApiResponse.ok(templates)
  } catch (error) { return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'VIEWER')

export const POST = withRBAC(async (request: Request, ctx: WorkspaceContext) => {
  try {
    const body = await request.json(); const parsed = CreateTemplateSchema.safeParse(body)
    if (!parsed.success) return ApiResponse.error('请求参数校验失败: ' + parsed.error.message, 400)
    const input = parsed.data
    const existing = await prisma.emailTemplate.findUnique({ where: { templateId: input.templateId } })
    if (existing) return ApiResponse.error(`模板标识已存在: ${input.templateId}`, 409)
    const created = await prisma.emailTemplate.create({ data: { templateId: input.templateId, workspaceId: ctx.workspaceId, name: input.name, subject: input.subject, bodyHtml: input.bodyHtml, bodyText: input.bodyText || input.bodyHtml.replace(/<[^>]*>/g, '').trim(), variables: JSON.stringify(input.variables || []), category: input.category || 'transactional', status: 'active', version: 1, createdBy: ctx.userId || 'system' } })
    return ApiResponse.ok(created)
  } catch (error) { return ApiResponse.error(error instanceof Error ? error.message : '未知错误', 500) }
}, 'MEMBER')
