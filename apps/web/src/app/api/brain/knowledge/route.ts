import { successResponse, errorResponse } from "@/lib/api-utils";
import { logger } from "@/lib/logger";

export async function GET(request: Request) {
  try {
    const knowledgePacks = [
      {
        id: "kn-001",
        title: "Incoterms 2020 国际贸易术语指引",
        category: "外贸基础",
        content: "详细定义 FOB, CIF, DAP, DDP 等 11 种国际贸易术语在风险转移、运费划分以及清关报关上的买卖双方责任分配，用作成本核算和开发信自动报价的底座支撑。",
        lastUpdated: "2026-06-12",
        source: "SOP-Default",
        usages: "报价核算, 流程控制",
      },
      {
        id: "kn-002",
        title: "信用证不符点常见防范守则",
        category: "财务合规",
        content: "提单装运港/目的港表述与 L/C 不符、商业发票货名表述与 L/C 不符等高频不符点的快速审单校验规则。由单证解析与合规检查 (ft-document-parsing) 技能自动比对校验。",
        lastUpdated: "2026-06-15",
        source: "财务风控部",
        usages: "单证合规, 风险控制",
      },
      {
        id: "kn-003",
        title: "北美/欧盟外贸询盘回复时效与等级划分",
        category: "客户跟进",
        content: "北美客户在当地时间上午 9:00 前完成第一批初筛，依据询盘优先级智能评估 (ft-inquiry-priority) 得分，对 A/B/C 三级询盘进行差异化多渠道跟进话术自动回复策略。",
        lastUpdated: "2026-06-18",
        source: "销售运营部",
        usages: "询盘评估, 自动分发",
      },
      {
        id: "kn-004",
        title: "典型原材料及海运运费实时浮动调价机制",
        category: "成本核算",
        content: "对接外贸报价接口与外部运费指数 api，在铜、铝、钢材基础大宗商品价格波动超出 3% 时自动触发系统警告，重新跑工作流计算最新 FCL/LCL 报价并沉淀至中期记忆中。",
        lastUpdated: "2026-06-19",
        source: "供应链中心",
        usages: "成本核算, 自动预警",
      },
    ];

    return successResponse({ knowledge: knowledgePacks });
  } catch (error) {
    logger.error("GET /api/brain/knowledge: 失败", {
      error: error instanceof Error ? error.message : "未知错误",
    });
    return errorResponse("服务器内部错误");
  }
}
