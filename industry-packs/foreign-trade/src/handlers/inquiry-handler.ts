/**
 * Inquiry Handler — 询盘核心业务逻辑
 *
 * 三域归属：Industry Pack Layer / Foreign Trade
 */

export interface InquiryHandlerDeps {
  prisma: any;
}

export interface InquiryListInput {
  workspaceId: string;
  priority?: string;
  status?: string;
  fromCountry?: string;
  page?: number;
  limit?: number;
}

export interface InquiryCreateInput {
  workspaceId: string;
  fromEmail: string;
  subject: string;
  content: string;
  countryCode?: string;
}

export interface InquiryGenerateEmailInput {
  inquiryId: string;
  workspaceId: string;
  callLlm: (params: { provider: string; model: string; systemPrompt: string; userPrompt: string }) => Promise<string>;
  selectModel: (ctx: { taskType: string; riskLevel: string; estimatedTokens: number; workspaceId: string }) => Promise<{ provider: string; model: string }>;
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 将两位国家代码转为对应 emoji 国旗。
 * 利用区域指示符 Unicode 偏移（A=0x1F1E6）计算旗帜序列。
 */
function countryCodeToFlag(code: string): string {
  try {
    const upper = (code ?? "US").toUpperCase().slice(0, 2);
    if (!/^[A-Z]{2}$/.test(upper)) return "🌐";
    const codePoints = [...upper].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65);
    return String.fromCodePoint(...codePoints);
  } catch {
    return "🌐";
  }
}

/**
 * 将 Schema 中的 priority 值（high/mid/low）统一映射为前端约定值（high/medium/low）。
 * Schema 与前端历史上使用了不同的枚举字符串，此函数集中处理转换。
 */
function normalizePriority(priority: string): string {
  if (priority === "mid") return "medium";
  return priority; // high / low 保持不变
}

// ============================================================
// listInquiries
// ============================================================

export async function listInquiries(
  input: InquiryListInput,
  deps: InquiryHandlerDeps,
): Promise<any> {
  const { workspaceId } = input;
  const p = deps.prisma;
  const page = input.page ?? 1;
  const limit = input.limit ?? 20;
  const skip = (page - 1) * limit;
  const where: any = { workspaceId };
  if (input.fromCountry) where.fromCountry = input.fromCountry.toUpperCase();

  const inquiries = await p.inquiry.findMany({ where, orderBy: { receivedAt: "desc" } });
  const quotations = await p.quotation.findMany({
    where: { workspaceId, projectId: { in: inquiries.map((i: any) => i.id) } },
  });

  const formattedList = inquiries.map((inquiry: any) => {
    const relatedQuotes = quotations.filter((q: any) => q.projectId === inquiry.id);
    let lastFollowUpAt = inquiry.receivedAt;
    if (relatedQuotes.length > 0) {
      const quoteTimes = relatedQuotes.map((q: any) => q.createdAt.getTime());
      lastFollowUpAt = new Date(Math.max(...quoteTimes));
    }
    const diffTime = Math.max(0, Date.now() - lastFollowUpAt.getTime());
    const daysSinceLastContact = Math.floor(diffTime / 86400000);

    let value = 0; let currency = "USD";
    if (relatedQuotes.length > 0) {
      const amounts = relatedQuotes.map((q: any) => { const n = parseFloat(String(q.totalAmount).replace(/[^0-9.]/g, "")); return isNaN(n) ? 0 : n; });
      const maxIdx = amounts.indexOf(Math.max(...amounts));
      if (maxIdx !== -1) { value = amounts[maxIdx]; currency = relatedQuotes[maxIdx].currency || "USD"; }
    }

    let status = "跟进中";
    const hasAccepted = relatedQuotes.some((q: any) => q.status === "accepted");
    const hasRejected = relatedQuotes.some((q: any) => q.status === "rejected");
    const hasSent = relatedQuotes.some((q: any) => q.status === "sent");
    if (hasAccepted) status = "已成交";
    else if (hasRejected && !hasSent) status = "已流失";
    else if (relatedQuotes.length > 0 || inquiry.replied) status = "已报价";

    // 基于 summary 字段识别技能标签
    const summaryLower = String(inquiry.summary || "").toLowerCase();
    const skills: string[] = [];
    if (summaryLower.includes("报价") || summaryLower.includes("quotation")) skills.push("报价单");
    if (summaryLower.includes("样品") || summaryLower.includes("sample")) skills.push("样品单");
    if (summaryLower.includes("物流") || summaryLower.includes("shipping")) skills.push("物流");
    if (summaryLower.includes("付款") || summaryLower.includes("payment")) skills.push("付款");

    return {
      id: inquiry.id,
      // ——— 前端期望字段名（BUG-01 修复：统一别名映射） ———
      customerName: inquiry.companyName,       // companyName → customerName
      product: inquiry.summary,               // summary → product
      country: inquiry.fromCountry,           // fromCountry → country
      // ——— 原始字段（保持，供其他消费者使用） ———
      companyName: inquiry.companyName,
      fromCountry: inquiry.fromCountry,
      countryFlag: inquiry.countryFlag,
      summary: inquiry.summary,
      // ——— priority：mid→medium（BUG-01 修复） ———
      priority: normalizePriority(inquiry.priority ?? "low"),
      status, value, currency,
      daysSinceLastContact, estimatedValue: value,
      repliesCount: relatedQuotes.length,
      lastFollowUpAt: lastFollowUpAt.toISOString(),
      receivedAt: inquiry.receivedAt?.toISOString(),
      createdAt: inquiry.createdAt?.toISOString(),
      skills, replied: inquiry.replied,
    };
  });

  // 筛选（前端 priority 已统一为 medium，筛选参数也需转换）
  let filtered = formattedList;
  if (input.priority) {
    const normalizedFilter = normalizePriority(input.priority);
    filtered = filtered.filter((i: any) => i.priority === normalizedFilter);
  }
  if (input.status) filtered = filtered.filter((i: any) => i.status === input.status);

  // 排序：优先级 DESC + 跟进时间 ASC
  const priorityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 };
  filtered.sort((a: any, b: any) => {
    const pDiff = (priorityOrder[b.priority] ?? 0) - (priorityOrder[a.priority] ?? 0);
    if (pDiff !== 0) return pDiff;
    return new Date(a.lastFollowUpAt).getTime() - new Date(b.lastFollowUpAt).getTime();
  });

  const total = filtered.length;
  const paged = filtered.slice(skip, skip + limit);
  return { items: paged, total, page, limit };
}

// ============================================================
// createInquiry
// ============================================================

export async function createInquiry(
  input: InquiryCreateInput,
  deps: InquiryHandlerDeps,
): Promise<any> {
  const p = deps.prisma;

  // BUG-01/02 修复：将 fromEmail/subject/content 适配为 Schema 实际字段
  // companyName：从邮箱域名提取公司名称（去掉 TLD，首字母大写）
  const emailDomain = (input.fromEmail ?? "").split("@")[1] ?? "";
  const domainBase = emailDomain.split(".")[0] ?? "Unknown";
  const companyName = domainBase.charAt(0).toUpperCase() + domainBase.slice(1) || "Unknown";

  // summary：合并主题与内容（截断到 2000 字符，与 UI 展示 line-clamp-1 匹配）
  const summary = [`[${input.subject ?? "No Subject"}]`, input.content ?? ""]
    .filter(Boolean)
    .join("\n")
    .slice(0, 2000);

  const countryCode = (input.countryCode ?? "US").toUpperCase().slice(0, 2);
  const inquiryId = crypto.randomUUID();

  const inquiry = await p.inquiry.create({
    data: {
      id: inquiryId,
      workspaceId: input.workspaceId,
      companyName,
      summary,
      fromCountry: countryCode,
      countryFlag: countryCodeToFlag(countryCode),
      channel: "email",
      priority: "mid",
      receivedAt: new Date(),
    },
  });

  return {
    ...inquiry,
    id: inquiry.id,
    // 同样返回前端别名字段，让 InquirySuccessPanel 可直接消费
    customerName: inquiry.companyName,
    product: inquiry.summary,
    country: inquiry.fromCountry,
    priority: normalizePriority(inquiry.priority ?? "low"),
    receivedAt: inquiry.receivedAt?.toISOString(),
    createdAt: inquiry.createdAt?.toISOString(),
  };
}

// ============================================================
// generateInquiryEmail
// ============================================================

export async function generateInquiryEmail(
  input: InquiryGenerateEmailInput,
  deps: InquiryHandlerDeps,
): Promise<string> {
  const p = deps.prisma;
  const inquiry = await p.inquiry.findUnique({ where: { id: input.inquiryId } });
  if (!inquiry || inquiry.workspaceId !== input.workspaceId) {
    throw new Error("询盘不存在");
  }
  const systemPrompt = "你是一个专业的外贸业务员，负责回复海外客户的询盘。请用英文撰写回复邮件，语气专业友好。";
  const userPrompt = `客户询盘信息：
公司：${inquiry.companyName}
摘要：${inquiry.summary}
国家：${inquiry.fromCountry}

请根据以上询盘内容，撰写一封英文回复邮件。邮件应包含：
1. 感谢客户的询盘
2. 对客户问题的回复
3. 下一步行动建议`;

  const decision = await input.selectModel({
    taskType: "analysis", riskLevel: "low",
    estimatedTokens: Math.ceil((systemPrompt.length + userPrompt.length) / 4),
    workspaceId: input.workspaceId,
  });
  return input.callLlm({ provider: decision.provider, model: decision.model, systemPrompt, userPrompt });
}
