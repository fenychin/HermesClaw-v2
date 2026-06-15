/**
 * SMTP 发送器 — 基于 nodemailer 封装（AGENTS.md §4.3 受控工具接入）
 *
 * —— SMTP 发送为 L2 操作：可自动执行，但必须写入 AuditLog（由调用方负责）。
 *    凭证从环境变量注入，禁止硬编码。生产环境 Token 有效期 ≤ 1 小时。
 */
import nodemailer from "nodemailer"
import type { Transporter } from "nodemailer"

/** SMTP 连接配置（全量从环境变量注入） */
export interface SmtpConfig {
  host: string
  port: number
  user: string
  password: string
  /** 是否使用 TLS（默认 true） */
  tls?: boolean
}

/**
 * 从环境变量构建 SMTP 配置。
 * —— 所有敏感信息通过环境变量注入，零硬编码。
 */
export function loadSmtpConfig(): SmtpConfig {
  const host = process.env["EMAIL_SMTP_HOST"]
  const portStr = process.env["EMAIL_SMTP_PORT"]
  const user = process.env["EMAIL_USER"]
  const pass = process.env["EMAIL_PASS"]

  if (!host || !user || !pass) {
    throw new Error(
      "[smtp-sender] 缺少必要环境变量：EMAIL_SMTP_HOST / EMAIL_USER / EMAIL_PASS 至少其一未设置",
    )
  }

  return {
    host,
    port: portStr ? parseInt(portStr, 10) : 587,
    user,
    password: pass,
    tls: process.env["EMAIL_SMTP_TLS"] !== "false",
  }
}

/** 邮件发送参数 */
export interface SendEmailInput {
  /** 收件人邮箱 */
  to: string
  /** 邮件主题 */
  subject: string
  /** 纯文本正文 */
  text: string
  /** HTML 正文（可选，优于纯文本） */
  html?: string
  /** 发件人显示名称 */
  fromName?: string
  /** 回复地址 */
  replyTo?: string
  /** 附件列表 */
  attachments?: Array<{
    filename: string
    content: Buffer | string
    contentType?: string
  }>
}

/** 发送结果 */
export interface SendEmailResult {
  ok: boolean
  messageId?: string
  error?: string
}

/**
 * 创建 SMTP Transporter（不自动验证连接）。
 * —— 调用方负责生命周期，建议用完即释放。
 */
export function createSmtpTransporter(config?: SmtpConfig): Transporter {
  const cfg = config ?? loadSmtpConfig()

  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465, // 465 端口使用隐式 TLS
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
    // 连接超时 30s；Socket 超时 60s
    connectionTimeout: 30_000,
    socketTimeout: 60_000,
  })
}

/**
 * 发送邮件。
 * —— L2 操作：由调用方在发送前后写入 AuditLog。
 *
 * @param transporter nodemailer Transporter 实例
 * @param input 邮件参数
 * @returns 发送结果（含 messageId 或 error）
 */
export async function sendEmail(
  transporter: Transporter,
  input: SendEmailInput,
): Promise<SendEmailResult> {
  try {
    const fromName = input.fromName ?? "HermesClaw"
    const user = process.env["EMAIL_USER"] ?? ""

    const info = await transporter.sendMail({
      from: `"${fromName}" <${user}>`,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      replyTo: input.replyTo,
      attachments: input.attachments,
    })

    return {
      ok: true,
      messageId: info.messageId,
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "未知 SMTP 错误"
    return { ok: false, error: message }
  }
}

/**
 * 验证 SMTP 连接是否可用。
 * —— 用于连接器状态检查（如 /api/connectors 健康诊断）。
 */
export async function verifySmtpConnection(
  config?: SmtpConfig,
): Promise<{ ok: boolean; error?: string }> {
  let transporter: Transporter | null = null
  try {
    transporter = createSmtpTransporter(config)
    await transporter.verify()
    return { ok: true }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "SMTP 验证失败",
    }
  } finally {
    if (transporter) transporter.close()
  }
}
