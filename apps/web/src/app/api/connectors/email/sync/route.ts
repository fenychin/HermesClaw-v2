import { prisma } from "@/lib/prisma"
import { logger } from "@/lib/logger"
import { successResponse, errorResponse } from "@/lib/api-utils"
import { createAuditEntry, updateAuditEntry, writeAuditLog, actorFromSession } from "@/lib/server/audit"
import { createEmailConnector } from "@/lib/server/connectors/email/email-connector"
import { parseInquiriesFromEmails } from "@/lib/server/connectors/email/inquiry-parser"
import { buildWorkspaceContext, requireWritable } from "@/lib/workspace"
import { writeAgentLog } from "@/lib/server/agent-log"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const ctx = await buildWorkspaceContext(request); requireWritable(ctx.role)
  const actor = await actorFromSession()
  const preEntry = await createAuditEntry({ actor, action: "connector.email.sync", targetType: "inquiry", targetId: `batch-${Date.now()}`, detail: "开始邮件同步", riskLevel: "low", workspaceId: ctx.workspaceId, automationLevel: "L2", triggeredBy: "system", contextSnapshot: { connectorType: "email" } })
  const connector = createEmailConnector(); const startTime = Date.now()
  try {
    const emails = await connector.fetchUnseen(50); const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`
    void writeAgentLog({ source: "connector", taskName: "Email IMAP 收信", status: "success", duration, detail: `拉取 ${emails.length} 封未读邮件` })
    if (emails.length === 0) { await updateAuditEntry({ auditId: preEntry.auditId, status: "success", detail: "无新邮件" }); return successResponse({ synced: 0, message: "无新邮件" }) }
    const inquiries = parseInquiriesFromEmails(emails); let synced = 0; const uids: number[] = []
    for (let i = 0; i < inquiries.length; i++) {
      try {
        await prisma.inquiry.create({ data: { id: crypto.randomUUID(), workspaceId: ctx.workspaceId, fromCountry: inquiries[i].fromCountry, countryFlag: inquiries[i].countryFlag, companyName: inquiries[i].companyName, summary: inquiries[i].summary, priority: inquiries[i].priority, channel: inquiries[i].channel, receivedAt: inquiries[i].receivedAt, replied: false } })
        uids.push(emails[i].uid); synced++
      } catch (err) { void writeAgentLog({ source: "connector", taskName: "Email 询盘入库", status: "failed", duration: "0s", detail: `入库失败: ${err instanceof Error ? err.message : "未知错误"}` }) }
    }
    if (uids.length > 0) await connector.markSeen(uids)
    await updateAuditEntry({ auditId: preEntry.auditId, status: "success", detail: `拉取 ${emails.length} 封，入库 ${synced} 条询盘`, contextSnapshot: { fetched: emails.length, synced, skipped: emails.length - synced } })
    return successResponse({ synced, fetched: emails.length, skipped: emails.length - synced, message: `成功入库 ${synced} 条询盘` })
  } catch (error) {
    const duration = `${((Date.now() - startTime) / 1000).toFixed(1)}s`; const msg = error instanceof Error ? error.message : "同步失败"
    void writeAgentLog({ source: "connector", taskName: "Email IMAP 收信", status: "failed", duration, detail: `IMAP 拉取失败: ${msg}` })
    await updateAuditEntry({ auditId: preEntry.auditId, status: "failed", detail: `同步失败: ${msg}` })
    void writeAuditLog({ actor, action: "connector.email.sync.failed", targetType: "inquiry", targetId: `error-${Date.now()}`, detail: `同步失败: ${msg}`, riskLevel: "medium", workspaceId: ctx.workspaceId })
    return errorResponse(`邮件同步失败: ${msg}`)
  } finally { await connector.dispose() }
}
