/**
 * 外贸工作流静态数据源
 * 作为工作流入口卡片的唯一数据来源
 */

export interface TradeWorkflow {
  /** 工作流唯一标识，用于路由跳转 /foreign-trade/workflows/[id] */
  id: string;
  /** 工作流名称 */
  title: string;
  /** 工作流简要描述 */
  description: string;
  /** Lucide 图标名称（字符串，由 WorkflowCard 动态解析） */
  icon: string;
}

export const TRADE_WORKFLOWS: TradeWorkflow[] = [
  {
    id: "inquiry-grade",
    title: "询盘分级",
    description: "自动对询盘质量评分，识别高意向客户",
    icon: "Filter",
  },
  {
    id: "dev-letter",
    title: "开发信生成",
    description: "基于客户画像生成个性化开发信",
    icon: "Mail",
  },
  {
    id: "customer-profile",
    title: "客户画像构建",
    description: "整合多渠道信息，生成完整客户档案",
    icon: "User",
  },
  {
    id: "quote-gen",
    title: "报价生成",
    description: "根据产品与客户条件快速生成报价单",
    icon: "FileText",
  },
  {
    id: "sample-mgmt",
    title: "样品管理",
    description: "跟踪样品寄送状态与客户反馈",
    icon: "Package",
  },
  {
    id: "order-push",
    title: "订单推进",
    description: "监控订单进度并自动提醒关键节点",
    icon: "TrendingUp",
  },
  {
    id: "exhibition-leads",
    title: "展会线索整理",
    description: "整理展会名片与线索，自动分级跟进",
    icon: "Users",
  },
  {
    id: "followup-remind",
    title: "客户跟进提醒",
    description: "根据跟进周期自动发送提醒任务",
    icon: "Bell",
  },
];
