/**
 * 智能体简要数据定义
 */
export interface MockAgent {
  id: string;
  name: string;
  avatarColor: string; // 用于渲染智能体头像的 Tailwind bg & text 配色
}

/**
 * 项目空间数据定义
 */
export interface MockProject {
  id: string;
  name: string;
  description: string;
  status: "processing" | "completed" | "on-hold"; // 进行中 / 已完成 / 搁置
  agents: MockAgent[];
  updatedAt: string;
  industry: "foreign-trade" | "other"; // 行业类型
  type: string;            // 项目类型：customer | order | region | product_line | other
  relatedClient?: string;  // 关联客户
  country?: string;        // 目标国家/地区
  productLine?: string;    // 产品线
  tags?: string[];         // 分类标签
}

/**
 * 5 条示例项目空间数据
 */
export const MOCK_PROJECTS: MockProject[] = [
  {
    id: "proj-001",
    name: "BrightPath 户外灯具出口项目",
    description: "针对北美市场的 LED IP65 户外防水灯具出口项目，包含 UL 认证更新、美国买家对接及海运物流跟踪。",
    status: "processing",
    agents: [
      { id: "agent-001", name: "Quincy", avatarColor: "bg-primary text-white" },
      { id: "agent-002", name: "Leon", avatarColor: "bg-brand-blue text-white" },
      { id: "agent-003", name: "Sophia", avatarColor: "bg-success text-white" },
    ],
    updatedAt: "2026-06-08T10:30:00Z",
    industry: "foreign-trade",
    type: "customer",
    relatedClient: "BrightPath Inc.",
    country: "US",
    productLine: "LED 户外灯具",
    tags: ["北美", "UL认证", "灯具"],
  },
  {
    id: "proj-002",
    name: "Schmidt 精密五金件采购空间",
    description: "与德国 Schmidt 公司的 Q3 采购意向跟进，包括表面处理工艺比对、欧元汇率锁定及采购合同谈判。",
    status: "processing",
    agents: [
      { id: "agent-004", name: "Marcus", avatarColor: "bg-warning text-white" },
      { id: "agent-005", name: "Victor", avatarColor: "bg-danger text-white" },
    ],
    updatedAt: "2026-06-07T16:00:00Z",
    industry: "foreign-trade",
    type: "order",
    relatedClient: "Schmidt GmbH",
    country: "DE",
    productLine: "精密五金件",
    tags: ["德国", "采购", "欧元"],
  },
  {
    id: "proj-003",
    name: "Sakura Living 家居模具紧急处理",
    description: "日本 Sakura 样品质检未通过（表面划痕）的紧急排查项目，重新评估模具及与日方协商交期。",
    status: "on-hold",
    agents: [
      { id: "agent-006", name: "Clara", avatarColor: "bg-brand text-white" },
      { id: "agent-007", name: "Sophia", avatarColor: "bg-success text-white" },
    ],
    updatedAt: "2026-06-06T09:45:00Z",
    industry: "foreign-trade",
    type: "customer",
    relatedClient: "Sakura Living Co.",
    country: "JP",
    productLine: "家居模具",
    tags: ["日本", "质检", "紧急"],
  },
  {
    id: "proj-004",
    name: "Maison Elegance 陶瓷餐具出口",
    description: "法国高档陶瓷餐具定制项目的打样和报价阶段跟进，包括反倾销关税评估及物流路线规划。",
    status: "completed",
    agents: [
      { id: "agent-001", name: "Quincy", avatarColor: "bg-primary text-white" },
      { id: "agent-008", name: "Diana", avatarColor: "bg-brand-blue text-white" },
    ],
    updatedAt: "2026-06-05T14:20:00Z",
    industry: "foreign-trade",
    type: "customer",
    relatedClient: "Maison Elegance SARL",
    country: "FR",
    productLine: "陶瓷餐具",
    tags: ["法国", "关税", "物流"],
  },
  {
    id: "proj-005",
    name: "智能家居产品线中东市场调研",
    description: "阿联酋及沙特智能照明/监控市场准入调研与分析，探索当地分销商渠道及竞争格局。",
    status: "processing",
    agents: [
      { id: "agent-002", name: "Leon", avatarColor: "bg-brand-blue text-white" },
      { id: "agent-009", name: "Sam", avatarColor: "bg-hint text-white" },
    ],
    updatedAt: "2026-06-04T11:15:00Z",
    industry: "other",
    type: "region",
    relatedClient: "多家潜在分销商",
    country: "AE",
    productLine: "智能家居",
    tags: ["中东", "市场调研", "智能"],
  },
];
