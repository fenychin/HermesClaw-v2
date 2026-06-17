/**
 * Email Template Mutation Service
 */
import { prisma } from "@/lib/prisma"

export class EmailTemplateError extends Error {
  constructor(public readonly httpStatus: number, message: string) { super(message); this.name = "EmailTemplateError" }
}

export async function getTemplate(id: string, workspaceId: string) {
  const template = await prisma.emailTemplate.findFirst({ where: { workspaceId, OR: [{ id }, { templateId: id }] } })
  if (!template) throw new EmailTemplateError(404, "模板不存在")
  return template
}

export async function patchTemplate(id: string, workspaceId: string, input: any) {
  const template = await getTemplate(id, workspaceId)
  const bodyText = input.bodyText || (input.bodyHtml ? input.bodyHtml.replace(/<[^>]*>/g, '').trim() : undefined)
  return prisma.emailTemplate.update({ where: { id: template.id }, data: { name: input.name ?? undefined, subject: input.subject ?? undefined, bodyHtml: input.bodyHtml ?? undefined, bodyText: bodyText ?? undefined, variables: input.variables ? JSON.stringify(input.variables) : undefined, category: input.category ?? undefined, version: template.version + 1 } })
}

export async function archiveTemplate(id: string, workspaceId: string) {
  const template = await getTemplate(id, workspaceId)
  return prisma.emailTemplate.update({ where: { id: template.id }, data: { status: 'archived' } })
}
