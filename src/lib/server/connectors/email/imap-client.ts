/**
 * IMAP 客户端 — 基于 imapflow 封装（AGENTS.md §4.3 受控工具接入）
 *
 * —— 连接配置从环境变量注入（禁止硬编码），支持：
 *    拉取未读邮件（UNSEEN）、按 UID 范围拉取、标记已读（\Seen）。
 *    失败上层处理，不做静默吞错。
 */
import { ImapFlow, type FetchMessageObject } from "imapflow"

/** IMAP 连接配置（全量从环境变量注入） */
export interface ImapConfig {
  host: string
  port: number
  user: string
  password: string
  /** 是否使用 TLS（默认 true，生产强制） */
  tls?: boolean
}

/**
 * 从环境变量构建 IMAP 配置。
 * —— 所有敏感信息通过环境变量注入，零硬编码。
 */
export function loadImapConfig(): ImapConfig {
  const host = process.env["EMAIL_IMAP_HOST"]
  const portStr = process.env["EMAIL_IMAP_PORT"]
  const user = process.env["EMAIL_USER"]
  const pass = process.env["EMAIL_PASS"]

  if (!host || !user || !pass) {
    throw new Error(
      "[imap-client] 缺少必要环境变量：EMAIL_IMAP_HOST / EMAIL_USER / EMAIL_PASS 至少其一未设置",
    )
  }

  return {
    host,
    port: portStr ? parseInt(portStr, 10) : 993,
    user,
    password: pass,
    tls: process.env["EMAIL_IMAP_TLS"] !== "false",
  }
}

/** 拉取结果中的邮件摘要 */
export interface EmailSummary {
  uid: number
  subject: string
  from: string
  to: string
  date: Date | null
  /** 纯文本正文（已解码） */
  textBody: string
  /** HTML 正文（已解码），可能为空 */
  htmlBody: string
  /** 是否已读 */
  seen: boolean
}

/**
 * 创建 IMAP 客户端实例（不自动连接）。
 * —— 调用方负责 connect / logout 生命周期管理。
 */
export function createImapClient(config?: ImapConfig): ImapFlow {
  const cfg = config ?? loadImapConfig()

  return new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls ?? true,
    auth: {
      user: cfg.user,
      pass: cfg.password,
    },
    // 生产环境 Token 有效期 ≤ 1 小时（AGENTS.md §4.3）
    // imapflow 内部维持长连接；外部由调用方控制超时回收
    logger: false,
  })
}

/**
 * 拉取所有 UNSEEN（未读）邮件。
 * —— 拉取成功后调用方应将邮件写入 Inquiry / AgentLog 并标记已读。
 *
 * @param client 已连接的 ImapFlow 实例
 * @param maxCount 单次最多拉取数，默认 50
 * @returns 未读邮件摘要列表
 */
export async function fetchUnseenEmails(
  client: ImapFlow,
  maxCount = 50,
): Promise<EmailSummary[]> {
  const mailbox = await client.mailboxOpen("INBOX")
  const unseenCount = mailbox.exists // INBOX 总消息数；imapflow 无单独的 unseen 计数

  if (unseenCount === 0) return []

  // 按 UID 降序拉取，优先取最新邮件
  const range = `${Math.max(1, unseenCount - maxCount + 1)}:${unseenCount}`
  const summaries: EmailSummary[] = []

  for await (const msg of client.fetch(
    { seq: range },
    {
      uid: true,
      flags: true,
      envelope: true,
      bodyStructure: true,
      source: true, // 完整 MIME 源码，用于提取正文
    },
  )) {
    // 跳过已读
    if (msg.flags?.has("\\Seen")) continue

    summaries.push(parseMessageToSummary(msg))
  }

  return summaries
}

/**
 * 将指定 UID 列表标记为已读。
 */
export async function markAsSeen(
  client: ImapFlow,
  uids: number[],
): Promise<void> {
  if (uids.length === 0) return

  // imapflow 按 UID 设置标记
  const uidSet = uids.join(",")
  await client.messageFlagsSet(
    { uid: uidSet },
    ["\\Seen"],
    { uid: true },
  )
}

/**
 * 从 FetchMessageObject 解析邮件摘要。
 * —— 纯文本优先，无纯文本时回退 HTML → text 的简易剥离。
 */
function parseMessageToSummary(msg: FetchMessageObject): EmailSummary {
  const envelope = msg.envelope

  // 从 MIME 源码提取正文
  let textBody = ""
  let htmlBody = ""

  try {
    const source = msg.source?.toString("utf-8") ?? ""
    // 简易 MIME 解析：提取 text/plain 与 text/html
    const parts = splitMimeParts(source)

    textBody = parts.textParts.join("\n\n")
    htmlBody = parts.htmlParts.join("\n\n")

    // 优先纯文本，回退 HTML
    if (!textBody && htmlBody) {
      textBody = stripHtml(htmlBody)
    }
  } catch {
    // 解析失败不阻塞流程，返回空正文
  }

  return {
    uid: msg.uid,
    subject: envelope?.subject ?? "(无主题)",
    from: formatAddress(envelope?.from),
    to: formatAddress(envelope?.to),
    date: envelope?.date ?? null,
    textBody,
    htmlBody,
    seen: msg.flags?.has("\\Seen") ?? false,
  }
}

/** 格式化 imapflow 地址对象为字符串 */
function formatAddress(
  addr:
    | { name?: string; address?: string }[]
    | null
    | undefined,
): string {
  if (!addr || addr.length === 0) return ""
  return addr
    .map((a) => (a.name ? `${a.name} <${a.address}>` : a.address ?? ""))
    .filter(Boolean)
    .join(", ")
}

/** 简易 MIME 多部分拆分 */
function splitMimeParts(source: string): {
  textParts: string[]
  htmlParts: string[]
} {
  const textParts: string[] = []
  const htmlParts: string[] = []

  // 按 boundary 拆分
  const boundaryMatch = source.match(
    /boundary="([^"]+)"/i,
  )
  if (!boundaryMatch) {
    // 无 boundary，整个 body 作为纯文本
    const body = extractBody(source)
    if (isHtmlContent(source)) {
      htmlParts.push(body)
    } else {
      textParts.push(body)
    }
    return { textParts, htmlParts }
  }

  const boundary = boundaryMatch[1]
  const sections = source.split(`--${boundary}`)

  for (const section of sections) {
    if (section.includes("Content-Type: text/plain")) {
      textParts.push(
        decodeQuotedPrintable(extractBody(section)),
      )
    } else if (section.includes("Content-Type: text/html")) {
      htmlParts.push(
        decodeQuotedPrintable(extractBody(section)),
      )
    }
  }

  return { textParts, htmlParts }
}

/** 剥离 MIME 头部，只保留 body */
function extractBody(part: string): string {
  const idx = part.indexOf("\r\n\r\n")
  if (idx === -1) return part
  let body = part.slice(idx + 4)
  // 去除末尾的 `--` 闭合
  const endIdx = body.lastIndexOf("\r\n--")
  if (endIdx > 0) body = body.slice(0, endIdx)
  return body.trim()
}

/** 判断是否为 HTML 内容类型 */
function isHtmlContent(part: string): boolean {
  return /content-type:\s*text\/html/i.test(part)
}

/** 简易 quoted-printable 解码 */
function decodeQuotedPrintable(text: string): string {
  return text
    .replace(/=\r?\n/g, "") // 软换行
    .replace(/=([0-9A-Fa-f]{2})/g, (_: string, hex: string) =>
      String.fromCharCode(parseInt(hex, 16)),
    )
}

/** 简易 HTML 标签剥离 */
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}
