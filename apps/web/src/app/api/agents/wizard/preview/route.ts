import { logger } from "@/lib/logger";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { resolveLlmProvider, callLlmText, isProviderAvailable } from "@/lib/server/llm-provider";

export const POST = withRBAC(async (req: Request, ctx: any) => {
  let requirement = "";
  let name = "新智能体";
  let role = "外贸助手";
  let bindSkills: string[] = [];
  let bindConnectors: string[] = [];

  try {
    const body = await req.json();
    requirement = body.requirement || "";
    name = body.name || "新智能体";
    role = body.role || "外贸助手";
    bindSkills = body.bindSkills || [];
    bindConnectors = body.bindConnectors || [];

    if (!requirement.trim()) {
      return ApiResponse.apiError("需求描述不能为空", 400);
    }

    const hasAnthropic = isProviderAvailable("anthropic");
    const hasDeepSeek = isProviderAvailable("deepseek");

    // 1. 如果密钥都未配置，采用 Mock 高保真兜底数据返回
    if (!hasAnthropic && !hasDeepSeek) {
      return ApiResponse.ok({ previewMarkdown: getMockPreviewData(requirement, name, role) });
    }

    // 2. 密钥可用，调用 LLM 扮演智能体模拟运行
    const { provider, model } = resolveLlmProvider();

    const systemPrompt = `你是一个名为 ${name} 的智能体，你的角色定位是 ${role}。
你已绑定了以下技能：[${bindSkills.join(", ")}]，以及连接器：[${bindConnectors.join(", ")}]。

现在，你需要根据用户的原始需求：“${requirement}”，模拟你的工作流来运行一次。
请以 markdown 格式输出一份高保真的模拟工作报告（或者工作样本）。
在报告中：
1. 声明你的智能体身份和拟运行的场景。
2. 详细展示你模拟执行的结果（例如，如果用户要开发信，就展示一封精美的开发信；如果用户要成本核算，就展示一张清晰的核算表格）。
3. 展现你作为智能体的高智能和专业性。

请直接输出 Markdown 内容，不要有 JSON 外壳，不要包含任何 \`\`\`markdown 块包裹，直接从 # 或 ## 开始输出正文。`;

    const userPrompt = `请扮演智能体，对需求 "${requirement}" 进行一次高仿真模拟执行，并输出 markdown 结果。`;

    const markdownResult = await callLlmText({
      provider,
      model,
      systemPrompt,
      userPrompt,
      maxTokens: 3000
    });

    return ApiResponse.ok({ previewMarkdown: markdownResult });
  } catch (error) {
    logger.error("POST /api/agents/wizard/preview: 运行失败", {
      error: error instanceof Error ? error.message : "未知错误"
    });
    // 捕获异常后降级返回 Mock 保证页面流转
    return ApiResponse.ok({ previewMarkdown: getMockPreviewData(requirement, name, role) });
  }
}, "MEMBER");

// ---- Mock 预览数据生成器 ----
function getMockPreviewData(reqText: string, name: string, role: string): string {
  const text = reqText.toLowerCase();

  if (text.includes("成本") || text.includes("核算") || text.includes("报价") || text.includes("fob")) {
    return `### 🤖 [${name}] (${role}) 模拟运行输出报告

**工作场景**：根据外贸订单需求，进行 FOB 成本及报价建议的自动化测算。

#### 1. 产品基本参数提取
- **产品类别**：高档不锈钢保温杯
- **规格/容量**：500ml
- **单批数量**：10,000 个
- **出厂单价 (EXW)**：¥18.50 / 个

#### 2. FOB 费用明细测算 (以 USD 计价，汇率 1 USD = 7.20 CNY)
| 费用项目 | 人民币金额 (CNY) | 折合美金 (USD) | 占比 & 说明 |
| :--- | :--- | :--- | :--- |
| **EXW 出厂总价** | ¥185,000.00 | $25,694.44 | 88.5% 货值基数 |
| **内陆运费 + 港口拼箱费** | ¥4,500.00 | $625.00 | 物流及码头操作 |
| **报关与商检费** | ¥1,200.00 | $166.67 | 正常出口报关手续 |
| **代理杂费及操作费** | ¥800.00 | $111.11 | 单证与综合手续费 |
| **预期退税收入 (退税率13%)** | -¥24,050.00 | -$3,340.28 | 出口国家政策补贴 |
| **核算总成本 (FOB)** | **¥167,450.00** | **$23,256.94** | 包含退税后的净支出 |

#### 3. 智能报价方案建议 (目标利润率 15%)
- **FOB 净保本美金单价**：$2.33 / 个
- **FOB 推荐销售美金单价**：**$2.74 / 个**
- **订单总报价 (FOB Shanghai)**：**$27,400.00 USD**
- **预计净利润率**：15.2%（预计净盈利 $4,143.06 USD）

*注：以上数据由智能体结合当前实时运价、汇率及退税率自动模拟测算得出。*`;
  }

  if (text.includes("信") || text.includes("邮件") || text.includes("询盘") || text.includes("回复")) {
    return `### 🤖 [${name}] (${role}) 模拟运行输出样例

**工作场景**：根据入站买家询盘意图，起草高度个性化的多语种开发信/回复信草稿。

#### 1. 收件人画像及背景分析
- **客户名称**：David Harrison (采购总监)
- **公司名称**：Apex Global Imports Inc. (美国主流家居零售进口商)
- **客户意图**：寻找长期稳定的不锈钢保温杯 OEM 生产商，单批采购量在 2 万只以上，要求通过 BSCI 验厂。

#### 2. 拟定开发信草稿 (英文)
**Subject**: Re: OEM Stainless Steel Water Bottles Inquiry - Apex Global & HermesClaw Mfg.

Dear Mr. David Harrison,

Thank you for reaching out to us regarding your search for a premium OEM partner for stainless steel water bottles.

We read with great interest about Apex Global's expansion in the eco-friendly drinkware line. As a certified manufacturer with over 10 years of OEM experience, we are fully equipped to meet your standards:

1. **Factory Audits**: Our facilities are fully BSCI and ISO 9001 certified, ensuring strict compliance with social responsibility and quality control.
2. **Production Capacity**: With a monthly output of 500,000 units, we can comfortably deliver your 20,000pcs order within 25 days.
3. **Customization & Quality**: We use food-grade 304/316 stainless steel with advanced double-wall vacuum insulation. A custom logo and color sample can be prepared for you within 3 days.

I have attached our latest product catalog and a preliminary FOB price list for your review. Would you be available for a brief 10-minute call this Thursday at 10:00 AM (EST) to discuss your specific design requirements?

Best regards,

**Leon**  
Lead Export Specialist  
HermesClaw Manufacturing Group  
Email: sales@hermesclaw-mfg.com | Tel: +86-138-0000-0000

#### 3. 智能体协作策略
- **自动触发器**：客户回复后，本智能体将自动更新 CRM 状态至“初步接触（L2）”并通知您的手机端。`;
  }

  return `### 🤖 [${name}] (${role}) 模拟运行输出报告

**工作场景**：多技能协同运行演示，自动诊断外贸工作流并输出操作日志。

#### 1. 执行流程日志 (Execution Trail)
- \`[09:00:12]\` **开始任务**：分析外贸业务协同场景。
- \`[09:00:15]\` **意图识别**：捕获用户请求：“提取附件商业发票数据并比对装箱单”。
- \`[09:00:18]\` **调用技能**：启动 \`ft-document-parsing\` (单证解析与合规检查)。
- \`[09:00:22]\` **提取结果**：发现发票总金额为 $45,800.00，数量为 500 箱；装箱单对应总数量为 498 箱。
- \`[09:00:24]\` **检测不符点**：**数量不一致！** 发票 (500 箱) 与装箱单 (498 箱) 存在 2 箱的差异。
- \`[09:00:26]\` **生成决策建议**：建议向货代及跟单员发送修正提示。

#### 2. 生成修正邮件草稿 (中文 & 英文)
- **主题**：关于单据不符警告 - 差异确认（订单编号: HC-20260621）
- **正文**：
  “单证部同事，系统在比对 commercial-invoice 和 packing-list 时检测到数量不符点。发票显示 500 箱，装箱单显示 498 箱，存在 2 箱短缺风险。请立即与仓库核实实装数量，并在 24 小时内修正报关单据。”

*注：本助手已将该不符点事件推送至审批管理器，避免在未纠正前误发信件。*`;
}
