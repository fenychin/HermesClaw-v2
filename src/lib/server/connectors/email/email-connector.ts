/**
 * Email 连接器 — 统一入口（AGENTS.md §4.3 受控工具接入）
 *
 * —— 实现 ToolRegistry 接口，注册为 'email-imap-smtp' 工具。
 *    组合 IMAP（收信）+ SMTP（发信）能力，供 Route Handler 调用。
 *    凭证全量从环境变量注入，零硬编码。
 *
 * —— P0-③ 连接器成功率追踪：每次 send / fetchUnseen 均写入 AgentLog，
 *    供 runHarnessEvaluation 评估连接器成功率。
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
import { writeAgentLog } from "@/lib/server/agent-log"

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
    // imapflow 的 connect() 是幂等的（已连接则 noop）
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
      const startTime = Date.now()
      try {
        const client = await ensureImap()
        const result = await fetchUnseenEmails(client, maxCount)
        void writeAgentLog({
          source: "connector" as const,
          taskName: "Email IMAP 收信",
          status: "success",
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          detail: `拉取 ${result.length} 封未读邮件`,
        })
        return result
      } catch (error) {
        void writeAgentLog({
          source: "connector" as const,
          taskName: "Email IMAP 收信",
          status: "failed",
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          detail: error instanceof Error ? error.message : "IMAP 连接失败",
        })
        throw error
      }
    },

    async markSeen(uids: number[]) {
      if (uids.length === 0) return
      const client = await ensureImap()
      await markAsSeen(client, uids)
    },

    async send(input: SendEmailInput) {
      const startTime = Date.now()
      try {
        const transporter = ensureSmtp()
        const result = await sendEmail(transporter, input)
        void writeAgentLog({
          source: "connector" as const,
          taskName: "Email SMTP 发信",
          status: result.success ? "success" : "failed",
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          detail: result.success
            ? `已发送至 ${input.to}：${input.subject}`
            : (result.error ?? "发送失败"),
          riskLevel: "medium", // 发信为对外可见操作
        })
        return result
      } catch (error) {
        void writeAgentLog({
          source: "connector" as const,
          taskName: "Email SMTP 发信",
          status: "failed",
          duration: `${((Date.now() - startTime) / 1000).toFixed(1)}s`,
          detail: error instanceof Error ? error.message : "SMTP 发送异常",
          riskLevel: "medium",
        })
        throw error
      }
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
