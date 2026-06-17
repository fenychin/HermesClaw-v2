/**
 * Email 连接器 — 统一入口（AGENTS.md §4.3 受控工具接入）
 *
 * —— 实现 ToolRegistry 接口，注册为 'email-imap-smtp' 工具。
 *    组合 IMAP（收信）+ SMTP（发信）能力，供 Route Handler 调用。
 *    凭证全量从环境变量注入，零硬编码。
 *
 * —— 本文件只做“如何发邮件/解析邮件”等纯 I/O 操作；
 *    不关心谁触发、riskLevel/automationLevel 或者是运行日志记录。
 */
import type { ImapFlow } from "imapflow"
import type { Transporter } from "nodemailer"
import {
  createImapClient,
  fetchUnseenEmails,
  markAsSeen,
  loadImapConfig,
  type EmailSummary,
  type ImapConfig,
} from "./imap-client"
import {
  createSmtpTransporter,
  sendEmail,
  verifySmtpConnection,
  loadSmtpConfig,
  type SendEmailInput,
  type SendEmailResult,
  type SmtpConfig,
} from "./smtp-sender"

/** 工具注册 ID */
export const EMAIL_TOOL_ID = "email-imap-smtp"

/** 工具注册元数据 */
export const EMAIL_TOOL_META = {
  name: EMAIL_TOOL_ID,
  description: "Email 连接器（IMAP 收信 + SMTP 发信），用于外贸询盘邮件处理",
  category: "connector",
  scopes: ["read", "send"],
  riskLevel: "medium" as const, // 发信为对外可见操作，标 medium
}

/** 连接器实例（含已认证的 IMAP + SMTP 客户端） */
export interface EmailConnector {
  /** 工具 ID */
  toolId: string
  /** 拉取未读邮件 */
  fetchUnseen(maxCount?: number): Promise<EmailSummary[]>
  /** 标记已读 */
  markSeen(uids: number[]): Promise<void>
  /** 发送邮件 */
  send(input: SendEmailInput): Promise<SendEmailResult>
  /** 验证 SMTP 连接 */
  verifySmtp(): Promise<{ ok: boolean; error?: string }>
  /** 释放连接资源 */
  dispose(): Promise<void>
}

/**
 * 创建 Email 连接器实例。
 * —— IMAP 客户端在首次 fetchUnseen 时惰性连接；
 *    SMTP transporter 在首次 send 时惰性创建。
 *
 * @param imapCfg IMAP 配置（可选，默认从环境变量加载）
 * @param smtpCfg SMTP 配置（可选，默认从环境变量加载）
 */
export function createEmailConnector(
  imapCfg?: ImapConfig,
  smtpCfg?: SmtpConfig,
): EmailConnector {
  const imapConfig = imapCfg ?? loadImapConfig()
  const smtpConfig = smtpCfg ?? loadSmtpConfig()

  let imapClient: ImapFlow | null = null
  let smtpTransporter: Transporter | null = null

  /** 确保 IMAP 已连接（惰性） */
  async function ensureImap(): Promise<ImapFlow> {
    if (!imapClient) {
      imapClient = createImapClient(imapConfig)
    }
    await imapClient.connect()
    return imapClient
  }

  /** 确保 SMTP Transporter 已创建（惰性） */
  function ensureSmtp(): Transporter {
    if (!smtpTransporter) {
      smtpTransporter = createSmtpTransporter(smtpConfig)
    }
    return smtpTransporter
  }

  return {
    toolId: EMAIL_TOOL_ID,

    async fetchUnseen(maxCount = 50) {
      const client = await ensureImap()
      return fetchUnseenEmails(client, maxCount)
    },

    async markSeen(uids: number[]) {
      if (uids.length === 0) return
      const client = await ensureImap()
      await markAsSeen(client, uids)
    },

    async send(input: SendEmailInput) {
      const transporter = ensureSmtp()
      return sendEmail(transporter, input)
    },

    async verifySmtp() {
      return verifySmtpConnection(smtpConfig)
    },

    async dispose() {
      if (imapClient) {
        try {
          await imapClient.logout()
        } catch {
          // 静默关闭
        }
        imapClient = null
      }
      if (smtpTransporter) {
        smtpTransporter.close()
        smtpTransporter = null
      }
    },
  }
}

