/**
 * 询盘解析器 — 从邮件内容提取外贸询盘关键字段
 *
 * —— 用于邮件同步流程：IMAP 拉取邮件 → parseInquiryFromEmail() 提取字段
 *    → 写入 Prisma Inquiry 表。
 *    解析失败不抛异常，返回降级结果（priority=low, channel='email'）。
 */
import type { EmailSummary } from "./imap-client"

/** 解析后的询盘字段（对齐 Prisma Inquiry 模型） */
export interface ParsedInquiry {
  /** 发件人邮箱提取的公司名（降级为 from 地址） */
  companyName: string
  /** 国家（从邮箱域名或邮件内容推断，降级为 "Unknown"） */
  fromCountry: string
  /** 国旗 emoji（根据国家映射） */
  countryFlag: string
  /** 邮件主题作为摘要 */
  summary: string
  /** 优先级评分：high | mid | low */
  priority: "high" | "mid" | "low"
  /** 渠道标识 */
  channel: string
  /** 原始接收时间 */
  receivedAt: Date
}

/**
 * 从邮件摘要解析询盘字段。
 * —— 解析全程 try/catch 确保不抛异常，失败返回降级结果。
 */
export function parseInquiryFromEmail(email: EmailSummary): ParsedInquiry {
  const subject = email.subject
  const body = email.textBody
  const from = email.from

  // 提取公司名
  const companyName = extractCompanyName(from)

  // 提取国家
  const fromCountry = extractCountry(from, subject, body)

  // 国旗映射
  const countryFlag = mapCountryFlag(fromCountry)

  // 优先级评分
  const priority = scorePriority(subject, body)

  return {
    companyName,
    fromCountry,
    countryFlag,
    summary: subject.length > 200 ? subject.slice(0, 197) + "..." : subject,
    priority,
    channel: "email",
    receivedAt: email.date ?? new Date(),
  }
}

/**
 * 批量解析邮件摘要列表。
 */
export function parseInquiriesFromEmails(
  emails: EmailSummary[],
): ParsedInquiry[] {
  return emails.map(parseInquiryFromEmail)
}

// ==============================
// 内部解析辅助函数
// ==============================

/** 提取公司名 */
function extractCompanyName(from: string): string {
  // 从 "公司名 <email@domain.com>" 格式提取
  const nameMatch = from.match(/^"?([^"<]+)"?\s*</)
  if (nameMatch && nameMatch[1].trim().length > 1) {
    return nameMatch[1].trim()
  }
  // 从邮箱地址提取域名作为降级
  const emailMatch = from.match(/<?([\w.]+@([\w.-]+))/)
  if (emailMatch) {
    const domain = emailMatch[2]
    // 常见免费邮箱域名 → 返回邮箱前缀
    const freeDomains = [
      "gmail.com", "yahoo.com", "hotmail.com", "outlook.com",
      "qq.com", "163.com", "126.com", "sina.com", "foxmail.com",
    ]
    if (freeDomains.some((d) => domain.toLowerCase().includes(d))) {
      return emailMatch[1].split("@")[0] ?? "Unknown"
    }
    // 企业域名 → 返回域名主体
    return domain.split(".")[0] ?? domain
  }
  return from || "Unknown"
}

/** 提取国家（三级推断） */
function extractCountry(from: string, subject: string, body: string): string {
  const combined = `${from} ${subject} ${body}`.toLowerCase()

  // 关键词 → 国家映射
  const countryKeywords: Record<string, string> = {
    china: "China", chinese: "China", "made in china": "China",
    usa: "USA", "united states": "USA", america: "USA",
    uk: "UK", "united kingdom": "UK", england: "UK", london: "UK",
    germany: "Germany", deutschland: "Germany",
    france: "France", paris: "France",
    japan: "Japan", tokyo: "Japan",
    korea: "South Korea", seoul: "South Korea",
    india: "India", mumbai: "India", delhi: "India",
    brazil: "Brazil",
    australia: "Australia", sydney: "Australia",
    canada: "Canada", toronto: "Canada",
    italy: "Italy", milano: "Italy",
    spain: "Spain", madrid: "Spain",
    netherlands: "Netherlands", holland: "Netherlands",
    singapore: "Singapore",
    uae: "UAE", dubai: "UAE", "united arab": "UAE",
    vietnam: "Vietnam",
    indonesia: "Indonesia", jakarta: "Indonesia",
    thailand: "Thailand", bangkok: "Thailand",
    malaysia: "Malaysia",
  }

  for (const [keyword, country] of Object.entries(countryKeywords)) {
    if (combined.includes(keyword)) return country
  }

  // 从邮箱域名推断
  const tldMap: Record<string, string> = {
    ".cn": "China", ".jp": "Japan", ".kr": "South Korea",
    ".de": "Germany", ".fr": "France", ".uk": "UK",
    ".au": "Australia", ".ca": "Canada", ".br": "Brazil",
    ".in": "India", ".it": "Italy", ".es": "Spain",
    ".nl": "Netherlands", ".sg": "Singapore", ".ae": "UAE",
    ".vn": "Vietnam", ".id": "Indonesia", ".th": "Thailand",
    ".my": "Malaysia", ".ru": "Russia", ".mx": "Mexico",
  }
  for (const [tld, country] of Object.entries(tldMap)) {
    if (combined.includes(tld)) return country
  }

  return "Unknown"
}

/** 国旗 emoji 映射（ISO 3166-1 alpha-2 → 国旗） */
function mapCountryFlag(country: string): string {
  const flagMap: Record<string, string> = {
    China: "🇨🇳", USA: "🇺🇸", UK: "🇬🇧", Germany: "🇩🇪",
    France: "🇫🇷", Japan: "🇯🇵", "South Korea": "🇰🇷",
    India: "🇮🇳", Brazil: "🇧🇷", Australia: "🇦🇺",
    Canada: "🇨🇦", Italy: "🇮🇹", Spain: "🇪🇸",
    Netherlands: "🇳🇱", Singapore: "🇸🇬", UAE: "🇦🇪",
    Vietnam: "🇻🇳", Indonesia: "🇮🇩", Thailand: "🇹🇭",
    Malaysia: "🇲🇾", Russia: "🇷🇺", Mexico: "🇲🇽",
    Unknown: "🌐",
  }
  return flagMap[country] ?? "🌐"
}

/** 询盘优先级评分（四级权重） */
function scorePriority(subject: string, body: string): "high" | "mid" | "low" {
  let score = 0
  const combined = `${subject} ${body}`.toLowerCase()

  // ① 紧急信号
  if (/\burgent\b|\basap\b|\bimmediate\b|\bquick\b/i.test(combined)) {
    score += 3
  }

  // ② 询盘信号词
  const inquiryWords = [
    "inquiry", "enquiry", "quotation", "quote", "price",
    "order", "sample", "catalog", "catalogue", "moq",
    "fob", "cif", "delivery", "shipment", "bulk",
    "wholesale", "oem", "custom", "specification",
  ]
  for (const word of inquiryWords) {
    if (combined.includes(word)) score += 1
  }

  // ③ 具体产品/数量提及
  if (/\b\d{2,}\s*(pcs|pieces|units|kg|tons|containers?)\b/i.test(combined)) {
    score += 2
  }
  if (/\$\s?\d|usd|eur\b/i.test(combined)) score += 2

  // ④ 垃圾/欺诈信号（负向）
  if (/\bspam\b|\bscam\b|\bfraud\b|\bphishing\b/i.test(combined)) {
    score -= 5
  }
  if (/\b(win|won)\s+a\s+(lottery|prize)\b/i.test(combined)) score -= 5
  if (/\bnigerian\b|\bprince\b|\binheritance\b/i.test(combined)) score -= 5

  if (score >= 5) return "high"
  if (score >= 2) return "mid"
  return "low"
}
