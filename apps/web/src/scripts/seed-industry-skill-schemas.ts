/**
 * 为外贸行业包 8 个技能补充完整的 inputSchema / outputSchema
 * 使用（在 apps/web 目录下）：npx tsx src/scripts/seed-industry-skill-schemas.ts
 */
import { PrismaClient } from "../generated/prisma-v2/client";
import { PrismaPg } from "@prisma/adapter-pg";
// @ts-ignore
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env["DATABASE_URL"] ?? "postgresql://postgres:postgres@localhost:5432/hermesclaw",
  max: 3,
});
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const SKILL_SCHEMAS: Array<{
  displayName: string;
  inputSchema: object;
  outputSchema: object;
  scenarios: string[];
  category: string;
}> = [
  {
    displayName: "客户画像分析",
    category: "foreign-trade:客户开发",
    scenarios: ["新客户开发", "询盘背景核查", "展会跟进"],
    inputSchema: {
      type: "object",
      required: ["companyName"],
      properties: {
        companyName: { type: "string", title: "目标公司名称", description: "需要分析的客户公司名称" },
        knownInfo: { type: "string", title: "已知背景信息", description: "可选，补充已知信息" },
        region: { type: "string", title: "所在地区", description: "如：Germany、USA、Japan" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        companyProfile: { type: "object", title: "企业基本画像" },
        decisionChain: { type: "object", title: "决策链分析" },
        purchaseBehavior: { type: "object", title: "采购行为特征" },
        communicationStrategy: { type: "object", title: "推荐沟通策略" },
        riskAssessment: { type: "object", title: "合作风险评估" }
      }
    }
  },
  {
    displayName: "报价策略生成",
    category: "foreign-trade:报价管理",
    scenarios: ["新订单报价", "价格谈判", "多术语报价比较"],
    inputSchema: {
      type: "object",
      required: ["productDetails", "strategy", "incoterms"],
      properties: {
        productDetails: { type: "object", title: "产品参数", description: "产品名称、规格、单位成本、数量" },
        strategy: { type: "string", title: "报价策略", enum: ["conservative", "balanced", "aggressive"], description: "保守/均衡/激进" },
        incoterms: { type: "string", title: "贸易术语", enum: ["FOB", "CIF", "DDP", "EXW", "CFR"] },
        paymentTerms: { type: "string", title: "付款方式", description: "如：T/T 30天、LC即期" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        priceRangeAdvice: { type: "object", title: "三档价格建议（底价/目标价/报出价）" },
        quotationDraft: { type: "string", title: "正式报价单（Markdown 表格）" },
        negotiationPlan: { type: "array", title: "谈判让步节奏（3 轮预案）" },
        riskWarnings: { type: "array", title: "汇率/合规风险提示" }
      }
    }
  },
  {
    displayName: "开发信生成",
    category: "foreign-trade:客户开发",
    scenarios: ["新客户首次触达", "展会后跟进", "冷邮件开发"],
    inputSchema: {
      type: "object",
      required: ["clientBackground", "sellingPoints", "language", "tone"],
      properties: {
        clientBackground: { type: "string", title: "客户背景信息", description: "来自客户画像分析结果" },
        sellingPoints: { type: "string", title: "产品核心卖点", description: "3-5 条产品差异化优势" },
        language: { type: "string", title: "主语言", enum: ["en", "zh", "de", "es", "fr", "ja"], description: "邮件主语言" },
        tone: { type: "string", title: "邮件语气", enum: ["professional", "friendly", "concise"] }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        subjectOptions: { type: "array", title: "3个主题行选项（含推荐度）" },
        emailCn: { type: "string", title: "中文版开发信" },
        emailEn: { type: "string", title: "英文版开发信" },
        writingRationale: { type: "string", title: "写作依据" },
        followUpFrame: { type: "object", title: "跟进邮件框架" },
        complianceCheck: { type: "object", title: "合规检查结果" }
      }
    }
  },
  {
    displayName: "询盘深度分析",
    category: "foreign-trade:询盘管理",
    scenarios: ["新询盘分级", "客户质量评估", "跟进优先级排序"],
    inputSchema: {
      type: "object",
      required: ["inquiryText"],
      properties: {
        inquiryText: { type: "string", title: "原始询盘文本", description: "完整的询盘邮件内容" },
        productCategory: { type: "string", title: "产品品类", description: "辅助匹配度评分" },
        clientCompany: { type: "string", title: "客户公司名", description: "辅助客户画像分析" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        scoreCard: { type: "object", title: "四维度加权评分表（总分+等级）" },
        customerProfile: { type: "object", title: "客户画像速写" },
        replyDraft: { type: "string", title: "首封回复邮件框架" },
        riskWarnings: { type: "array", title: "风险提示" },
        followUpPriority: { type: "string", title: "跟进优先级（A/B/C）" }
      }
    }
  },
  {
    displayName: "自动生成报价单",
    category: "foreign-trade:报价管理",
    scenarios: ["正式报价单生成", "多产品报价", "PDF 报价单导出"],
    inputSchema: {
      type: "object",
      required: ["productList", "incoterms", "targetPort"],
      properties: {
        productList: { type: "array", title: "产品列表", description: "含名称、规格、数量、成本价" },
        incoterms: { type: "string", title: "贸易术语", enum: ["FOB", "CIF", "DDP", "EXW"] },
        targetPort: { type: "string", title: "目的港/目的地", description: "如：Hamburg、Los Angeles" },
        currency: { type: "string", title: "报价币种", description: "默认 USD" },
        profitMargin: { type: "number", title: "目标利润率（%）", description: "默认 15" },
        validityDays: { type: "number", title: "报价有效期（天）", description: "默认 30" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        quotationId: { type: "string", title: "报价单编号" },
        lineItems: { type: "array", title: "报价明细行" },
        totalAmount: { type: "number", title: "总金额" },
        markdownTable: { type: "string", title: "Markdown 报价表格" },
        approvalRequired: { type: "boolean", title: "是否需要审批" }
      }
    }
  },
  {
    displayName: "撰写开发信",
    category: "foreign-trade:客户开发",
    scenarios: ["首次触达", "产品推介", "样品邀约"],
    inputSchema: {
      type: "object",
      required: ["clientProfile", "productSellingPoints"],
      properties: {
        clientProfile: { type: "object", title: "客户画像", description: "来自 customer-profile 技能输出" },
        productSellingPoints: { type: "array", title: "产品核心卖点", description: "3-5 条差异化优势" },
        tone: { type: "string", title: "邮件语气", enum: ["professional", "friendly", "concise"], description: "默认 professional" },
        recipientName: { type: "string", title: "收件人姓名", description: "用于个性化称呼" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        subjectOptions: { type: "array", title: "主题行选项（含打开率预测）" },
        fullEmailText: { type: "string", title: "完整邮件正文（Markdown）" },
        followUpDay7: { type: "string", title: "7天跟进邮件模板" },
        complianceCheck: { type: "object", title: "合规检查（GDPR/CAN-SPAM）" }
      }
    }
  },
  {
    displayName: "调用智能体",
    category: "foreign-trade:编排协同",
    scenarios: ["多智能体协同", "复杂任务拆解", "跨技能编排"],
    inputSchema: {
      type: "object",
      required: ["targetAgent", "taskPrompt"],
      properties: {
        targetAgent: { type: "string", title: "目标智能体", description: "智能体 ID 或 @mention 名称" },
        taskPrompt: { type: "string", title: "任务描述", description: "自然语言任务说明" },
        outputFormat: { type: "string", title: "期望输出格式", enum: ["json", "markdown", "text"], description: "默认 json" },
        priority: { type: "string", title: "任务优先级", enum: ["high", "normal", "low"], description: "默认 normal" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        taskId: { type: "string", title: "任务 ID" },
        dispatchedTo: { type: "string", title: "已分派至" },
        status: { type: "string", title: "执行状态" },
        taskResult: { type: "object", title: "任务执行结果" },
        executionRationale: { type: "string", title: "执行依据" }
      }
    }
  },
  {
    displayName: "创建项目空间",
    category: "foreign-trade:项目管理",
    scenarios: ["新客户项目立项", "展会跟进项目", "大单管理"],
    inputSchema: {
      type: "object",
      required: ["projectName"],
      properties: {
        projectName: { type: "string", title: "项目名称", description: "如：ACME 公司 2026Q3 订单" },
        associatedClient: { type: "string", title: "关联客户名称" },
        projectType: { type: "string", title: "项目类型", enum: ["new-client", "existing-client", "exhibition", "sample"], description: "默认 new-client" },
        keyFocus: { type: "string", title: "重点关注事项", description: "如：付款条款谈判" }
      }
    },
    outputSchema: {
      type: "object",
      properties: {
        spaceId: { type: "string", title: "项目空间 ID" },
        spaceStructure: { type: "object", title: "项目空间结构建议" },
        taskList: { type: "array", title: "初始任务清单（5-8个）" },
        milestones: { type: "array", title: "关键时间节点" },
        agentConfig: { type: "object", title: "推荐数字员工配置" }
      }
    }
  }
];

async function main() {
  let updated = 0;
  let skipped = 0;

  for (const entry of SKILL_SCHEMAS) {
    const skills = await prisma.skill.findMany({
      where: { name: entry.displayName, status: { not: "inactive" } }
    });

    if (skills.length === 0) {
      console.warn(`⚠️  未找到「${entry.displayName}」，跳过`);
      skipped++;
      continue;
    }

    for (const skill of skills) {
      await prisma.skill.update({
        where: { id: skill.id },
        data: {
          inputSchema: JSON.stringify(entry.inputSchema),
          outputSchema: JSON.stringify(entry.outputSchema),
          scenarios: JSON.stringify(entry.scenarios),
          category: entry.category,
          isValid: true,
          status: "active",
        }
      });
      console.log(`✅ 已更新 inputSchema/outputSchema「${entry.displayName}」(${skill.id})`);
      updated++;
    }
  }

  console.log(`\n📊 完成：更新 ${updated} 条，跳过 ${skipped} 条\n`);
}

main()
  .then(() => pool.end())
  .catch((e) => { console.error("❌", e); pool.end(); process.exit(1); });
