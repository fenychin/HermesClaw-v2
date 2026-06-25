/* eslint-disable @typescript-eslint/no-explicit-any */
import { prisma } from "@/lib/prisma"
import { writeAuditLog, createAuditEntry, updateAuditEntry } from "@/lib/server/audit"
import { registerCapability, recordCapabilityUsage } from "../capability-registry"
import type { Prisma, EmailSendLog } from "@/generated/prisma-v2/client"
import crypto from "crypto"
import net from "net"
import tls from "tls"

// 邮件速率限制（顶层常量，不得内联）
export const EMAIL_DEFAULT_RATE_LIMIT_PER_HOUR = 100
export const EMAIL_MAX_TO_RECIPIENTS = 50       // 单次最多收件人数
export const EMAIL_MAX_ATTACHMENT_SIZE_MB = 10  // 最大附件大小
export const EMAIL_UNSUBSCRIBE_FOOTER_PLACEHOLDER = '{{UNSUBSCRIBE_LINK}}'
export const EMAIL_RETRY_MAX_ATTEMPTS = 3
export const EMAIL_RETRY_DELAY_MS = process.env.NODE_ENV === 'test' ? 1 : 5000        // 重试间隔 5s

// Capability Registry 注册信息（顶层常量）
export const EMAIL_CONNECTOR_CAPABILITY_ID = 'built-in.email'
export const EMAIL_CONNECTOR_VERSION = '1.0.0'

// 错误类型
export class RateLimitExceededError extends Error {
  constructor(connectorId: string, remaining: number) {
    super(`Email rate limit exceeded for connector ${connectorId}. Remaining: ${remaining}`)
    this.name = 'RateLimitExceededError'
  }
}

export class EmailTemplateNotFoundError extends Error {
  constructor(templateId: string) {
    super(`Email template not found: ${templateId}`)
    this.name = 'EmailTemplateNotFoundError'
  }
}

export class EmailConnectorNotFoundError extends Error {
  constructor(connectorId: string) {
    super(`Email connector not found: ${connectorId}`)
    this.name = 'EmailConnectorNotFoundError'
  }
}

export class SmtpConnectionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SmtpConnectionError'
  }
}

export class LeaseTokenValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'LeaseTokenValidationError'
  }
}

export interface EmailAddress {
  address: string
  name?: string
}

export interface EmailAttachment {
  filename: string
  content: string     // base64 编码
  contentType: string
  size: number
}

export interface SendEmailInput {
  connectorId: string
  workspaceId: string
  from: EmailAddress
  to: EmailAddress[]
  cc?: EmailAddress[]
  subject: string
  bodyHtml: string
  bodyText?: string          // 若为空，从 bodyHtml 自动提取纯文本
  attachments?: EmailAttachment[]
  templateId?: string        // 若使用模板，传入 templateId
  templateVariables?: Record<string, string>  // 模板变量
  agentId?: string
  taskId?: string
  workflowRunId?: string     // 关联的工作流运行 ID
  leaseToken?: string        // ConnectorLease token（高风险批量发送时必传）
  injectUnsubscribeLink?: boolean  // 营销邮件注入退订链接
  unsubscribeUrl?: string
}

export interface SendEmailResult {
  sendId: string
  status: 'sent' | 'failed'
  messageId?: string    // SMTP 返回的 Message-ID
  errorCode?: string
  errorMessage?: string
  latencyMs: number
  compensationStrategy: string // 补偿策略：发信物理不可逆，使用 manual/none（人工核对或发送纠正邮件）
}

export interface EmailConnectorConfig {
  host: string
  port: number
  secure: boolean       // TLS
  auth: {
    user: string
    pass: string        // 从环境变量读取，不得明文存储
  }
  fromName?: string
  fromAddress?: string
}

export interface EmailConnectorDeps {
  prisma?: typeof prisma
  writeAuditLog?: typeof writeAuditLog
  sendSmtp?: (config: EmailConnectorConfig, mail: {
    from: string
    to: string[]
    cc?: string[]
    subject: string
    bodyHtml: string
    bodyText: string
  }) => Promise<{ messageId: string }>
}

/**
 * 将 Email Connector 注册到 Capability Registry
 */
export async function initializeEmailConnector(
  workspaceId: string,
  deps?: EmailConnectorDeps
): Promise<void> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  // 1. 检查 Registry 中是否已有 EMAIL_CONNECTOR_CAPABILITY_ID@EMAIL_CONNECTOR_VERSION
  const existing = await activePrisma.capabilityVersion.findUnique({
    where: {
      capabilityId_version: {
        capabilityId: EMAIL_CONNECTOR_CAPABILITY_ID,
        version: EMAIL_CONNECTOR_VERSION
      }
    }
  })
  if (existing) {
    return // 幂等直接返回
  }

  // 2. 确保数据库里存在对应的 Connector 记录
  const dbConn = await activePrisma.connector.findUnique({
    where: { id: EMAIL_CONNECTOR_CAPABILITY_ID }
  })
  if (!dbConn) {
    await activePrisma.connector.create({
      data: {
        id: EMAIL_CONNECTOR_CAPABILITY_ID,
        workspaceId,
        name: 'Built-in Email Connector',
        iconEmoji: '📧',
        description: 'SMTP & IMAP built-in email connector',
        status: 'available',
        category: 'email',
        permissions: JSON.stringify(['send']),
        usedByAgents: JSON.stringify([]),
        config: {
          host: 'smtp.gmail.com',
          port: 465,
          secure: true,
          auth: {
            user: 'system@hermesclaw.ai',
            pass: 'env:EMAIL_SMTP_PASS'
          }
        } as Prisma.InputJsonValue
      }
    })
  }

  // 3. 调用 registerCapability 进行能力注册
  await registerCapability({
    capabilityId: EMAIL_CONNECTOR_CAPABILITY_ID,
    capabilityType: 'connector',
    version: EMAIL_CONNECTOR_VERSION,
    workspaceId,
    displayName: 'Built-in Email',
    description: 'Provides transactional and notification email delivery services',
    inputSchema: {
      type: 'object',
      properties: {
        to: { type: 'array', items: { type: 'object' } },
        subject: { type: 'string' },
        bodyHtml: { type: 'string' }
      },
      required: ['to', 'subject', 'bodyHtml']
    },
    outputSchema: {
      type: 'object',
      properties: {
        sendId: { type: 'string' },
        status: { type: 'string' }
      }
    },
    tags: ['email', 'built-in'],
    changelog: 'Initial built-in email connector registration',
    publishedBy: 'system',
    publishedAt: new Date()
  }, { prisma: activePrisma, writeAuditLog: activeWriteAuditLog })

  // 4. 写入 AuditLog
  await activeWriteAuditLog({
    actor: 'system',
    action: 'connector.initialized',
    targetType: 'connector',
    targetId: EMAIL_CONNECTOR_CAPABILITY_ID,
    detail: `Initialized built-in email connector ${EMAIL_CONNECTOR_CAPABILITY_ID}@${EMAIL_CONNECTOR_VERSION}`,
    riskLevel: 'low',
    workspaceId
  })
}

/**
 * 注入退订链接
 */
export function injectUnsubscribeBlock(
  html: string,
  text: string,
  url: string
): { html: string; text: string } {
  let renderedHtml = html
  let renderedText = text

  // 注入 HTML
  if (renderedHtml.includes(EMAIL_UNSUBSCRIBE_FOOTER_PLACEHOLDER)) {
    renderedHtml = renderedHtml.replace(new RegExp(EMAIL_UNSUBSCRIBE_FOOTER_PLACEHOLDER, 'g'), url)
  } else {
    const footerHtml = `<div><hr/><p style="font-size:12px;color:#999;">If you wish to unsubscribe, please click <a href="${url}">here</a>.</p></div>`
    if (renderedHtml.includes('</body>')) {
      renderedHtml = renderedHtml.replace('</body>', `${footerHtml}</body>`)
    } else {
      renderedHtml += footerHtml
    }
  }

  // 注入 Text
  if (renderedText.includes(EMAIL_UNSUBSCRIBE_FOOTER_PLACEHOLDER)) {
    renderedText = renderedText.replace(new RegExp(EMAIL_UNSUBSCRIBE_FOOTER_PLACEHOLDER, 'g'), url)
  } else {
    renderedText += `\n\nIf you wish to unsubscribe, please click here: ${url}`
  }

  return { html: renderedHtml, text: renderedText }
}

/**
 * 渲染邮件模板（简单 Mustache 风格）
 */
export async function renderEmailTemplate(
  templateId: string,
  workspaceId: string,
  variables: Record<string, string>,
  options?: { injectUnsubscribeLink?: boolean; unsubscribeUrl?: string },
  deps?: EmailConnectorDeps
): Promise<{ subject: string; bodyHtml: string; bodyText: string }> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  // 1. 读取模板
  const template = await activePrisma.emailTemplate.findFirst({
    where: { templateId, workspaceId, status: 'active' }
  })
  if (!template) {
    throw new EmailTemplateNotFoundError(templateId)
  }

  // 2. 检查未提供的变量占位符
  let renderedSubject = template.subject
  let renderedHtml = template.bodyHtml
  let renderedText = template.bodyText

  const allPlaceholders: string[] = []
  const regex = /\{\{([^}]+)\}\}/g
  let match
  while ((match = regex.exec(renderedHtml)) !== null) {
    allPlaceholders.push(match[1].trim())
  }
  while ((match = regex.exec(renderedSubject)) !== null) {
    allPlaceholders.push(match[1].trim())
  }
  while ((match = regex.exec(renderedText)) !== null) {
    allPlaceholders.push(match[1].trim())
  }

  const uniquePlaceholders = Array.from(new Set(allPlaceholders)).filter(p => p !== 'UNSUBSCRIBE_LINK')
  const missingKeys = uniquePlaceholders.filter(key => variables[key] === undefined)

  if (missingKeys.length > 0) {
    await activeWriteAuditLog({
      actor: 'system',
      action: 'email.template.warning',
      targetType: 'template',
      targetId: templateId,
      detail: `Template rendered with missing variables: ${missingKeys.join(', ')}`,
      riskLevel: 'low',
      workspaceId
    })
  }

  // 3. 替换占位符
  const replaceAll = (text: string) => {
    let result = text
    for (const [key, value] of Object.entries(variables)) {
      result = result.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g'), value)
    }
    return result
  }

  renderedSubject = replaceAll(renderedSubject)
  renderedHtml = replaceAll(renderedHtml)
  renderedText = replaceAll(renderedText)

  // 4. 注入退订链接
  const unsubUrl = options?.unsubscribeUrl || 'https://example.com/unsubscribe'
  if (options?.injectUnsubscribeLink) {
    const injected = injectUnsubscribeBlock(renderedHtml, renderedText, unsubUrl)
    renderedHtml = injected.html
    renderedText = injected.text
  }

  return {
    subject: renderedSubject,
    bodyHtml: renderedHtml,
    bodyText: renderedText
  }
}

/**
 * 检查并消费速率限制令牌
 */
export async function checkRateLimit(
  connectorId: string,
  recipientCount: number,
  deps?: EmailConnectorDeps
): Promise<{ allowed: boolean; remaining: number }> {
  const activePrisma = deps?.prisma || prisma

  // 悲观锁/事务执行
  return await activePrisma.$transaction(async (tx) => {
    const conn = await tx.connector.findUnique({
      where: { id: connectorId }
    })
    if (!conn) {
      throw new EmailConnectorNotFoundError(connectorId)
    }

    let rateLimitResetAt = conn.rateLimitResetAt
    let rateLimitUsed = conn.rateLimitUsed
    const rateLimit = conn.rateLimit || EMAIL_DEFAULT_RATE_LIMIT_PER_HOUR
    const now = new Date()

    if (!rateLimitResetAt || rateLimitResetAt.getTime() < now.getTime()) {
      rateLimitUsed = 0
      rateLimitResetAt = new Date(now.getTime() + 60 * 60 * 1000)
    }

    if (rateLimitUsed + recipientCount > rateLimit) {
      // 达到限流，更新重置时间
      await tx.connector.update({
        where: { id: connectorId },
        data: {
          rateLimitResetAt,
          rateLimitUsed
        }
      })
      return { allowed: false, remaining: rateLimit - rateLimitUsed }
    }

    rateLimitUsed += recipientCount
    await tx.connector.update({
      where: { id: connectorId },
      data: {
        rateLimitResetAt,
        rateLimitUsed
      }
    })

    return { allowed: true, remaining: rateLimit - rateLimitUsed }
  })
}

/**
 * 内置 SMTP 原生套接字握手实现
 */
export async function sendSmtpNative(
  config: EmailConnectorConfig,
  mail: {
    from: string
    to: string[]
    cc?: string[]
    subject: string
    bodyHtml: string
    bodyText: string
  }
): Promise<{ messageId: string }> {
  // test/development 环境跳过真实套接字发送，返回 mock id
  if (process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'development') {
    return { messageId: `mock-msg-${Date.now()}-${Math.random().toString(36).substring(7)}` }
  }

  return new Promise((resolve, reject) => {
    const socket = config.secure
      ? tls.connect(config.port, config.host, { rejectUnauthorized: false })
      : net.connect(config.port, config.host)

    socket.setTimeout(10000)

    let stage = 0
    const write = (str: string) => socket.write(str + '\r\n')

    socket.on('data', (data) => {
      const response = data.toString()
      const code = parseInt(response.substring(0, 3), 10)

      try {
        if (stage === 0 && code === 220) {
          write(`EHLO ${config.host}`)
          stage = 1
        } else if (stage === 1 && code === 250) {
          write('AUTH LOGIN')
          stage = 2
        } else if (stage === 2 && code === 334) {
          write(Buffer.from(config.auth.user).toString('base64'))
          stage = 3
        } else if (stage === 3 && code === 334) {
          write(Buffer.from(config.auth.pass).toString('base64'))
          stage = 4
        } else if (stage === 4 && code === 235) {
          write(`MAIL FROM:<${mail.from}>`)
          stage = 5
        } else if (stage === 5 && code === 250) {
          write(`RCPT TO:<${mail.to[0]}>`)
          stage = 6
        } else if (stage === 6 && code === 250) {
          write('DATA')
          stage = 7
        } else if (stage === 7 && code === 354) {
          const boundary = '----=_Part_' + Math.random().toString().substring(2)
          let mime = `From: ${mail.from}\r\n`
          mime += `To: ${mail.to.join(', ')}\r\n`
          mime += `Subject: =?UTF-8?B?${Buffer.from(mail.subject).toString('base64')}?=\r\n`
          mime += `MIME-Version: 1.0\r\n`
          mime += `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n`

          mime += `--${boundary}\r\n`
          mime += `Content-Type: text/plain; charset="utf-8"\r\n\r\n`
          mime += `${mail.bodyText}\r\n\r\n`

          mime += `--${boundary}\r\n`
          mime += `Content-Type: text/html; charset="utf-8"\r\n\r\n`
          mime += `${mail.bodyHtml}\r\n\r\n`

          mime += `--${boundary}--`

          write(mime + '\r\n.')
          stage = 8
        } else if (stage === 8 && code === 250) {
          write('QUIT')
          resolve({ messageId: `msg-${Date.now()}` })
          socket.end()
        }
      } catch (err) {
        reject(err)
        socket.end()
      }
    })

    socket.on('error', (err) => {
      reject(new SmtpConnectionError(`SMTP connection error: ${err.message}`))
    })

    socket.on('timeout', () => {
      reject(new SmtpConnectionError('SMTP connection timeout'))
      socket.end()
    })
  })
}

/**
 * 发送邮件 (完整流程)
 */
export async function sendEmail(
  input: SendEmailInput,
  deps?: EmailConnectorDeps
): Promise<SendEmailResult> {
  const activePrisma = deps?.prisma || prisma
  const activeWriteAuditLog = deps?.writeAuditLog || writeAuditLog

  const start = Date.now()
  const sendId = `snd-${crypto.randomUUID()}`

  const storeEmailReceipt = async (isSuccess: boolean, lat: number, msgId?: string, err?: any) => {
    const receipt = {
      receiptId: `rcpt-${sendId}`,
      taskId: input.taskId || `task-mail-${sendId}`,
      workflowRunId: input.workflowRunId || `wf-mail-${sendId}`,
      connectorId: input.connectorId,
      idempotencyKey: input.taskId || sendId,
      outcome: isSuccess ? ("success" as const) : ("failure" as const),
      executedAt: new Date().toISOString(),
      response: {
        sendId,
        messageId: msgId ?? '',
        latencyMs: lat,
      },
      errorCode: isSuccess
        ? undefined
        : (err instanceof RateLimitExceededError
          ? 'RATE_LIMIT_EXCEEDED'
          : (err instanceof Error ? err.name : (typeof err === 'string' ? err : 'SMTP_SEND_FAILED'))),
      compensationStrategy: 'manual/none',
      version: '1.0.0',
    }

    try {
      const { storeReceipt } = await import("../receipt-store")
      await storeReceipt({
        receiptId: receipt.receiptId,
        taskId: receipt.taskId,
        workflowRunId: receipt.workflowRunId,
        connectorId: receipt.connectorId,
        idempotencyKey: receipt.idempotencyKey,
        outcome: receipt.outcome,
        executedAt: receipt.executedAt,
        response: receipt.response,
        errorCode: receipt.errorCode,
        compensationStrategy: receipt.compensationStrategy,
        version: receipt.version,
        workspaceId: input.workspaceId,
      })
    } catch (storeErr) {
      console.error("[email-connector] ActionReceipt 存库失败：", storeErr)
    }
  }

  // 1. 校验 to 收件人限制
  if (input.to.length > EMAIL_MAX_TO_RECIPIENTS) {
    throw new Error(`Recipient count exceeds limit of ${EMAIL_MAX_TO_RECIPIENTS}`)
  }

  // 2. 若为高风险批量发送，校验 leaseToken
  if (input.to.length > 10) {
    if (!input.leaseToken) {
      throw new LeaseTokenValidationError('Batch sending requires a valid ConnectorLease leaseToken')
    }
    if (input.leaseToken.startsWith('lease-')) {
      // 内存临时租约，格式校验放行
    } else if (input.leaseToken.startsWith('acp-')) {
      // 审批检查点授权，查询数据库状态
      const checkpoint = await activePrisma.approvalCheckpoint.findUnique({
        where: { checkpointId: input.leaseToken }
      })
      if (!checkpoint || checkpoint.decision !== 'approved') {
        throw new LeaseTokenValidationError('ConnectorLease token is invalid or expired')
      }
      if (checkpoint.expiresAt.getTime() < Date.now()) {
        throw new LeaseTokenValidationError('ConnectorLease token is invalid or expired')
      }
      if (checkpoint.workspaceId !== input.workspaceId) {
        throw new LeaseTokenValidationError('ConnectorLease does not match connector or workspace')
      }
      // 写入审计对账日志 (AGENTS.md §3.5)
      await activeWriteAuditLog({
        actor: input.agentId || 'system',
        action: 'approval.verified',
        targetType: 'approval',
        targetId: input.leaseToken,
        detail: `Verified and consumed approval checkpoint token ${input.leaseToken} for batch email sending.`,
        riskLevel: 'low',
        workspaceId: input.workspaceId,
        workflowRunId: input.workflowRunId
      })
    } else {
      throw new LeaseTokenValidationError('ConnectorLease token is invalid or expired')
    }
  }

  let finalSubject = input.subject
  let finalHtml = input.bodyHtml
  let finalText = input.bodyText || ''

  try {
    // 3. 若使用模板，调用 renderEmailTemplate
    if (input.templateId) {
      const rendered = await renderEmailTemplate(
        input.templateId,
        input.workspaceId,
        input.templateVariables || {},
        {
          injectUnsubscribeLink: input.injectUnsubscribeLink,
          unsubscribeUrl: input.unsubscribeUrl
        },
        { prisma: activePrisma, writeAuditLog: activeWriteAuditLog }
      )
      finalSubject = rendered.subject
      finalHtml = rendered.bodyHtml
      finalText = rendered.bodyText
    } else {
      // 未使用模板，若有 injectUnsubscribeLink，也需要注入退订
      const unsubUrl = input.unsubscribeUrl || 'https://example.com/unsubscribe'
      if (input.injectUnsubscribeLink) {
        const injected = injectUnsubscribeBlock(finalHtml, finalText, unsubUrl)
        finalHtml = injected.html
        finalText = injected.text
      }
    }

    // 4. 若 bodyText 仍然为空，从 bodyHtml 剥离
    if (!finalText) {
      finalText = finalHtml.replace(/<[^>]*>/g, '').trim()
    }

    // 5. 校验速率限制
    const rateCheck = await checkRateLimit(input.connectorId, input.to.length, { prisma: activePrisma })
    if (!rateCheck.allowed) {
      // 记录发送失败日志 (不记录 bodyHtml/bodyText 保护隐私)
      await activePrisma.emailSendLog.create({
        data: {
          sendId,
          workspaceId: input.workspaceId,
          connectorId: input.connectorId,
          templateId: input.templateId || null,
          fromAddress: input.from.address,
          toAddresses: JSON.stringify(input.to.map(t => t.address)),
          ccAddresses: JSON.stringify(input.cc?.map(c => c.address) || []),
          subject: finalSubject,
          status: 'failed',
          agentId: input.agentId || null,
          taskId: input.taskId || null,
          leaseToken: input.leaseToken || null,
          errorCode: 'RATE_LIMIT_EXCEEDED',
          errorMessage: 'Hourly sending rate limit exceeded'
        }
      })

      // 写入 AuditLog
      await activeWriteAuditLog({
        actor: input.agentId || 'system',
        action: 'email.failed',
        targetType: 'email',
        targetId: sendId,
        detail: `Email send failed: Rate limit exceeded for connector ${input.connectorId}.`,
        riskLevel: 'medium',
        workspaceId: input.workspaceId,
        workflowRunId: input.workflowRunId
      })

      throw new RateLimitExceededError(input.connectorId, rateCheck.remaining)
    }

    // 6. 获取 Connector 配置并解密/解析环境变量中的密码
    const conn = await activePrisma.connector.findUnique({
      where: { id: input.connectorId }
    })
    if (!conn) {
      throw new EmailConnectorNotFoundError(input.connectorId)
    }

    const config = (conn.config || {}) as any
    let smtpPass = config.auth?.pass || ''
    if (smtpPass.startsWith('env:')) {
      const envKey = smtpPass.substring(4)
      smtpPass = process.env[envKey] || ''
    }

    const smtpConfig: EmailConnectorConfig = {
      host: config.host || 'smtp.gmail.com',
      port: config.port || 465,
      secure: config.secure !== false,
      auth: {
        user: config.auth?.user || '',
        pass: smtpPass
      }
    }

    // 7. 创建 EmailSendLog (status='pending')
    const logRecord = await activePrisma.emailSendLog.create({
      data: {
        sendId,
        workspaceId: input.workspaceId,
        connectorId: input.connectorId,
        templateId: input.templateId || null,
        fromAddress: input.from.address,
        toAddresses: JSON.stringify(input.to.map(t => t.address)),
        ccAddresses: JSON.stringify(input.cc?.map(c => c.address) || []),
        subject: finalSubject,
        status: 'pending',
        agentId: input.agentId || null,
        taskId: input.taskId || null,
        leaseToken: input.leaseToken || null
      }
    })

    // 8. 预执行审计（AGENTS.md §3.5 连接器预执行审计约定）
    //    在 net.socket.write() 发送前必须预先注册 connector.execute 预审计事件
    const connectorAudit = await createAuditEntry({
      actor: input.agentId || 'system',
      action: 'connector.execute',
      targetType: 'connector',
      targetId: input.connectorId,
      detail: `Email connector executing SMTP send to ${input.to.length} recipient(s)`,
      riskLevel: input.to.length > 10 ? 'high' : 'medium',
      workspaceId: input.workspaceId,
      workflowRunId: input.workflowRunId
    })

    // 9. SMTP 发送及退避重试循环
    let retryCount = 0
    let success = false
    let messageId = ''
    let lastError: any = null

    const mailPayload = {
      from: input.from.address,
      to: input.to.map(t => t.address),
      cc: input.cc?.map(c => c.address),
      subject: finalSubject,
      bodyHtml: finalHtml,
      bodyText: finalText
    }

    while (retryCount < EMAIL_RETRY_MAX_ATTEMPTS && !success) {
      try {
        const sendResult = deps?.sendSmtp
          ? await deps.sendSmtp(smtpConfig, mailPayload)
          : await sendSmtpNative(smtpConfig, mailPayload)
        
        messageId = sendResult.messageId
        success = true
      } catch (err) {
        lastError = err
        retryCount++
        if (retryCount < EMAIL_RETRY_MAX_ATTEMPTS) {
          await new Promise(r => setTimeout(r, EMAIL_RETRY_DELAY_MS))
        }
      }
    }

    const latencyMs = Date.now() - start

    if (success) {
      // 10. 更新成功日志
      await activePrisma.emailSendLog.update({
        where: { id: logRecord.id },
        data: {
          status: 'sent',
          sentAt: new Date(),
          retryCount
        }
      })

      // 11. 更新预执行审计为 success（AGENTS.md §3.5 连接器预执行审计约定）
      await updateAuditEntry({
        auditId: connectorAudit.auditId,
        status: 'success',
        detail: `Email sent successfully to ${input.to.map(t => t.address).join(', ')}. MessageId: ${messageId}`
      })

      // 12. 调用 recordCapabilityUsage (遥测)
      // 永远不 throw，fire-and-forget
      recordCapabilityUsage({
        capabilityId: EMAIL_CONNECTOR_CAPABILITY_ID,
        capabilityType: 'connector',
        version: EMAIL_CONNECTOR_VERSION,
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        taskId: input.taskId,
        status: 'success',
        latencyMs
      }, { prisma: activePrisma }).catch(err => console.error('[sendEmail] telemetry failed:', err))

      // 13. 写入 AuditLog
      await activeWriteAuditLog({
        actor: input.agentId || 'system',
        action: 'email.sent',
        targetType: 'email',
        targetId: sendId,
        detail: `Email sent successfully to ${input.to.map(t => t.address).join(', ')}. Subject: ${finalSubject}`,
        riskLevel: 'low',
        workspaceId: input.workspaceId,
        workflowRunId: input.workflowRunId
      })

      await storeEmailReceipt(true, latencyMs, messageId)
      return {
        sendId,
        status: 'sent',
        messageId,
        latencyMs,
        compensationStrategy: 'manual/none'
      }
    } else {
      // 重试用尽，更新失败日志
      await activePrisma.emailSendLog.update({
        where: { id: logRecord.id },
        data: {
          status: 'failed',
          errorCode: lastError instanceof Error ? lastError.name : 'SMTP_SEND_FAILED',
          errorMessage: lastError instanceof Error ? lastError.message : 'Unknown SMTP failure',
          retryCount
        }
      })

      // 更新预执行审计为 failed（AGENTS.md §3.5 连接器预执行审计约定）
      await updateAuditEntry({
        auditId: connectorAudit.auditId,
        status: 'failed',
        detail: `Email send failed after ${retryCount} attempts. Error: ${lastError?.message || 'SMTP fail'}`
      })

      recordCapabilityUsage({
        capabilityId: EMAIL_CONNECTOR_CAPABILITY_ID,
        capabilityType: 'connector',
        version: EMAIL_CONNECTOR_VERSION,
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        taskId: input.taskId,
        status: 'failure',
        latencyMs,
        errorCode: lastError instanceof Error ? lastError.name : 'SMTP_SEND_FAILED'
      }, { prisma: activePrisma }).catch(err => console.error('[sendEmail] telemetry failed:', err))

      await activeWriteAuditLog({
        actor: input.agentId || 'system',
        action: 'email.failed',
        targetType: 'email',
        targetId: sendId,
        detail: `Email send failed after ${retryCount} attempts. Error: ${lastError?.message || 'SMTP fail'}`,
        riskLevel: 'medium',
        workspaceId: input.workspaceId,
        workflowRunId: input.workflowRunId
      })

      await storeEmailReceipt(false, latencyMs, undefined, lastError)
      return {
        sendId,
        status: 'failed',
        errorCode: lastError instanceof Error ? lastError.name : 'SMTP_SEND_FAILED',
        errorMessage: lastError instanceof Error ? lastError.message : 'Unknown SMTP failure',
        latencyMs,
        compensationStrategy: 'manual/none'
      }
    }

  } catch (error) {
    const latencyMs = Date.now() - start
    await storeEmailReceipt(false, latencyMs, undefined, error)
    // 捕获可能从 checkRateLimit 抛出的 RateLimitExceededError 或者其它配置错误
    return {
      sendId,
      status: 'failed',
      errorCode: error instanceof Error ? error.name : 'UNKNOWN_ERROR',
      errorMessage: error instanceof Error ? error.message : 'Unknown error occurred',
      latencyMs,
      compensationStrategy: 'manual/none'
    }
  }
}

/**
 * 分页查询发送日志
 */
export async function listEmailSendLogs(
  workspaceId: string,
  options?: {
    connectorId?: string
    status?: string
    since?: Date
    page?: number
    pageSize?: number
  },
  deps?: EmailConnectorDeps
): Promise<{ logs: EmailSendLog[]; total: number }> {
  const activePrisma = deps?.prisma || prisma
  const page = options?.page || 1
  const pageSize = options?.pageSize || 10
  const skip = (page - 1) * pageSize

  const whereClause: any = { workspaceId }
  if (options?.connectorId) {
    whereClause.connectorId = options.connectorId
  }
  if (options?.status) {
    whereClause.status = options.status
  }
  if (options?.since) {
    whereClause.createdAt = { gte: options.since }
  }

  const [logs, total] = await Promise.all([
    activePrisma.emailSendLog.findMany({
      where: whereClause,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize
    }),
    activePrisma.emailSendLog.count({
      where: whereClause
    })
  ])

  return {
    logs,
    total
  }
}
