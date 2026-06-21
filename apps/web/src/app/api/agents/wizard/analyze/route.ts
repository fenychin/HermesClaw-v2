import { logger } from "@/lib/logger";
import { withRBAC } from "@/lib/server/api-handler";
import { ApiResponse } from "@/lib/server/api-response";
import { resolveLlmProvider, callLlmText, callDeepSeekJson, callAnthropicStructured, isProviderAvailable } from "@/lib/server/llm-provider";

// 系统中现有的外贸 Skills
const EXISTING_SKILLS = [
  { id: "ft-inquiry-sorter", label: "邮件解析与询盘分拣", desc: "自动解析入站邮件，提取产品、数量、交期、目标价等关键信息" },
  { id: "ft-inquiry-grading", label: "询盘智能分级", desc: "综合多维度对入站询盘进行 A/B/C 三级评分" },
  { id: "ft-inquiry-priority", label: "询盘优先级评估", desc: "对询盘进行评分，辅助业务员决策跟进顺序" },
  { id: "ft-outreach-email", label: "自动开发信生成", desc: "基于询盘与客户画像生成个性化的多语种开发信" },
  { id: "ft-customer-profiling", label: "客户画像分析", desc: "多渠道构建客户画像与背景信息提取" },
  { id: "ft-cost-accounting", label: "产品参数提取与成本核算", desc: "核算外贸产品成本，输出多贸易术语下的成本明细表" },
  { id: "ft-quote-generator", label: "外贸报价生成与优化", desc: "综合成本、汇率、利润生成多贸易术语报价方案" },
  { id: "ft-document-parsing", label: "单证解析与合规检查", desc: "自动解析提单、发票、原产地证，校验一致性" },
  { id: "ft-follow-up-crm", label: "客户跟进管理与 CRM 同步", desc: "自动生成跟进提醒，判定销售阶段并更新 CRM" },
  { id: "ft-competitor-analysis", label: "竞品分析与市场画像", desc: "采集竞品动态及海关进出口数据，生成市场格局报告" }
];

// 系统内置连接器
const EXISTING_CONNECTORS = [
  { id: "email-connector", label: "邮件收发连接器", desc: "用于自动接收客户询盘邮件或自动发送生成的开发信/报价单" }
];

export const POST = withRBAC(async (req: Request, ctx: any) => {
  try {
    const { requirement = "" } = await req.json();
    if (!requirement.trim()) {
      return ApiResponse.apiError("需求描述不能为空", 400);
    }

    const hasAnthropic = isProviderAvailable("anthropic");
    const hasDeepSeek = isProviderAvailable("deepseek");

    // 1. 如果密钥都未配置，或者在开发/测试降级状态，采用高保真 Mock 降级兜底，保障系统流转可用
    if (!hasAnthropic && !hasDeepSeek) {
      return ApiResponse.ok(getMockAnalyzeData(requirement));
    }

    // 2. 密钥可用，调用 LLM 运行结构化解析
    const { provider, model } = resolveLlmProvider();

    const responseSchema = {
      type: "object",
      properties: {
        name: { type: "string", description: "推荐的智能体名称，例如：开发信写作专家" },
        role: { type: "string", description: "推荐的角色定位，例如：多语种文案师" },
        description: { type: "string", description: "推荐的智能体职责描述" },
        bindSkills: {
          type: "array",
          items: { type: "string" },
          description: "初始推荐绑定的技能ID列表，必须从提供的现有 Skills 列表中选择"
        },
        bindConnectors: {
          type: "array",
          items: { type: "string" },
          description: "初始推荐绑定的连接器ID列表，必须从提供的现有 Connectors 列表中选择"
        },
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "问题唯一标识，例如：q1" },
              question: { type: "string", description: "问题题目，引导用户细化或定制他的智能体" },
              type: { type: "string", enum: ["single", "multiple"], description: "问题类型：single(单选) 或 multiple(多选)" },
              options: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    label: { type: "string", description: "选项显示的友好文本" },
                    value: { type: "string", description: "选项的代表值" },
                    skills: { type: "array", items: { type: "string" }, description: "选中此项会额外绑定的 skills 列表" },
                    connectors: { type: "array", items: { type: "string" }, description: "选中此项会额外绑定的 connectors 列表" }
                  },
                  required: ["label", "value", "skills", "connectors"]
                }
              }
            },
            required: ["id", "question", "type", "options"]
          },
          description: "针对用户的特定需求生成 2 个交互式选择题，问题和选项应针对需求量身定制。每个问题的选项如果包含让智能体发信或做其他事，可以在 skills/connectors 字段内塞入对应的技能/连接器 ID，以用于在用户做出选择后动态绑定这些能力。"
        }
      },
      required: ["name", "role", "description", "bindSkills", "bindConnectors", "questions"]
    };

    const systemPrompt = `你是一个智能体架构顾问（Agent Architect）。你的职责是解析用户填写的原始需求，帮助其设计和自动生成一个最适合他工作场景的外贸智能体（Agent）。
你必须输出符合 JSON 结构的智能体设计。

现有 Skills（技能）列表：
${JSON.stringify(EXISTING_SKILLS, null, 2)}

现有 Connectors（连接器）列表：
${JSON.stringify(EXISTING_CONNECTORS, null, 2)}

设计原则：
1. 根据用户的原始需求推荐最相关的技能和连接器。
2. 动态生成 2 个交互定制问题（包含单选或多选卡片）。这些问题必须切合用户需求。
3. 选项中如果涉及需要特定技能（如 CRM 同步、竞品监控）或连接器（如邮件发送），应在 options 的 skills 或 connectors 列表中关联对应的 ID。这样用户点击此选项后，系统会自动为智能体动态赋能。
4. 必须输出符合 Schema 规范的 JSON 结构，不要有多余的文字。`;

    const userPrompt = `用户输入的原始需求是：
"${requirement}"

请针对此需求进行分析，返回智能体推荐名字、角色、描述、绑定技能、绑定连接器，并生成 2 个量身定制的单选或多选提问以协助用户确认细节。`;

    let llmResult: any;
    if (provider === "anthropic") {
      llmResult = await callAnthropicStructured({
        systemPrompt,
        userPrompt,
        schema: responseSchema,
        model,
      });
    } else {
      llmResult = await callDeepSeekJson({
        systemPrompt,
        userPrompt: `${userPrompt}\n\n严格以 JSON 格式返回，确保匹配要求的 Schema 字段结构。`,
        model,
      });
    }

    return ApiResponse.ok(llmResult);
  } catch (error) {
    logger.error("POST /api/agents/wizard/analyze: 运行失败", {
      error: error instanceof Error ? error.message : "未知错误"
    });
    // 捕获异常后降级返回 Mock 保证页面流转
    return ApiResponse.ok(getMockAnalyzeData(""));
  }
}, "MEMBER");

// ---- Mock 兜底数据生成器 ----
function getMockAnalyzeData(reqText: string) {
  const text = reqText.toLowerCase();

  // FOB/成本/核算
  if (text.includes("成本") || text.includes("核算") || text.includes("报价") || text.includes("fob")) {
    return {
      name: "FOB 成本核算专家",
      role: "精益成本核算官",
      description: "基于询盘与产品参数，自动核算 FOB/CIF 成本，综合汇率、税率给出最优利润溢价报价明细表。",
      bindSkills: ["ft-cost-accounting"],
      bindConnectors: [],
      questions: [
        {
          id: "q_quote_method",
          question: "您需要该智能体在核算完后，自动为您生成外贸报价方案吗？",
          type: "single",
          options: [
            { label: "需要，自动生成多贸易术语报价方案", value: "yes", skills: ["ft-quote-generator"], connectors: [] },
            { label: "不需要，我只要成本核算明细表", value: "no", skills: [], connectors: [] }
          ]
        },
        {
          id: "q_email_notify",
          question: "核算及报价完成后，是否需要自动通过邮件发信给客户或抄送老板？",
          type: "single",
          options: [
            { label: "需要，自动发送邮件", value: "email", skills: [], connectors: ["email-connector"] },
            { label: "不需要，仅在系统面板内展示", value: "none", skills: [], connectors: [] }
          ]
        }
      ]
    };
  }

  // 邮件/询盘/开发信
  if (text.includes("信") || text.includes("邮件") || text.includes("询盘") || text.includes("回复")) {
    return {
      name: "外贸开发信专家",
      role: "多语种营销文案师",
      description: "根据入站询盘和客户背景数据，自动进行意图分析并撰写高转化率的外贸开发信或跟进草稿。",
      bindSkills: ["ft-outreach-email", "ft-inquiry-sorter"],
      bindConnectors: [],
      questions: [
        {
          id: "q_inquiry_level",
          question: "是否需要在撰写回信前，智能评估该询盘的成交意向并分级排序？",
          type: "single",
          options: [
            { label: "是，对询盘进行智能分级与优先级评分", value: "grade", skills: ["ft-inquiry-grading", "ft-inquiry-priority"], connectors: [] },
            { label: "否，直接起草回复开发信", value: "direct", skills: [], connectors: [] }
          ]
        },
        {
          id: "q_crm_sync",
          question: "生成回复信件后，是否需要同步至 CRM 系统并创建下一次跟进提醒？",
          type: "single",
          options: [
            { label: "是，自动同步 CRM 并生成跟进日志", value: "crm", skills: ["ft-follow-up-crm"], connectors: [] },
            { label: "否，生成后我自己手动处理", value: "manual", skills: [], connectors: [] }
          ]
        }
      ]
    };
  }

  // 通用/兜底
  return {
    name: "外贸全流程助手",
    role: "AI 业务协同专家",
    description: "全能型外贸智能体，集成询盘解析、成本核算与开发信起起草技能，协同处理日常外贸业务流程。",
    bindSkills: ["ft-inquiry-sorter", "ft-cost-accounting", "ft-outreach-email"],
    bindConnectors: [],
    questions: [
      {
        id: "q_channel",
        question: "该智能体是否拥有通过邮件服务器自动向外发信的权限？",
        type: "single",
        options: [
          { label: "拥有，自动绑定邮件收发连接器", value: "yes", skills: [], connectors: ["email-connector"] },
          { label: "不拥有，仅在系统内生成草稿", value: "no", skills: [], connectors: [] }
        ]
      },
      {
        id: "q_monitor",
        question: "您是否需要它对竞品动态及目标海外市场海关进出口数据进行定期监控？",
        type: "single",
        options: [
          { label: "需要，绑定竞品分析与海关监控技能", value: "yes", skills: ["ft-competitor-analysis"], connectors: [] },
          { label: "不需要，仅处理日常业务单据", value: "no", skills: [], connectors: [] }
        ]
      }
    ]
  };
}
