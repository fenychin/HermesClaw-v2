/**
 * 智能体页面级 Mock 数据
 * —— 作为 API 加载失败时的回退数据。ID 与数据库种子数据对齐。
 *
 * 当 GET /api/agents 返回空或失败时，页面自动回退至此数据，
 * 确保用户始终能看到 8 个内置外贸智能体。
 */

export interface AgentData {
  id: string
  name: string
  role: string
  status: 'active' | 'idle' | 'error'
  tags: string[]
  taskCount: number
  isBuiltIn: boolean
  /** 自动化授权等级（AGENTS.md §4.7） */
  automationLevel?: string
}

/**
 * 8 个内置外贸智能体
 * —— ID 对齐 prisma/seed.ts 中 mockAgents[0..7] (agent-001 ~ agent-008)
 */
export const mockAgents: AgentData[] = [
  {
    id: 'agent-001',
    name: '外贸销售助手',
    role: '客户开发与跟进',
    status: 'active',
    tags: ['邮件撰写', '需求分析', '多语言'],
    taskCount: 154,
    isBuiltIn: true,
    automationLevel: 'L2',
  },
  {
    id: 'agent-002',
    name: '询盘分拣员',
    role: '自动分类与评级',
    status: 'active',
    tags: ['NLP', '打分模型', '自动化'],
    taskCount: 890,
    isBuiltIn: true,
    automationLevel: 'L1',
  },
  {
    id: 'agent-003',
    name: '客户跟进员',
    role: '生命周期维护',
    status: 'idle',
    tags: ['日程提醒', '关怀邮件'],
    taskCount: 45,
    isBuiltIn: true,
    automationLevel: 'L2',
  },
  {
    id: 'agent-004',
    name: '报价代理',
    role: '智能生成报价单',
    status: 'active',
    tags: ['表格处理', '核算成本'],
    taskCount: 312,
    isBuiltIn: true,
    automationLevel: 'L3',
  },
  {
    id: 'agent-005',
    name: '邮件写作员',
    role: '专业外贸邮件生成',
    status: 'active',
    tags: ['高转化率', '本地化表达'],
    taskCount: 1205,
    isBuiltIn: true,
    automationLevel: 'L2',
  },
  {
    id: 'agent-006',
    name: '产品资料员',
    role: '整理商品详情与规格',
    status: 'idle',
    tags: ['知识库检索', '多语言翻译'],
    taskCount: 78,
    isBuiltIn: true,
    automationLevel: 'L1',
  },
  {
    id: 'agent-007',
    name: '市场研究员',
    role: '竞品与行业趋势分析',
    status: 'error',
    tags: ['Web Search', '研报生成'],
    taskCount: 12,
    isBuiltIn: true,
    automationLevel: 'L2',
  },
  {
    id: 'agent-008',
    name: '风险审查员',
    role: '客户背景与合规风险排查',
    status: 'active',
    tags: ['风控模型', '数据清洗'],
    taskCount: 56,
    isBuiltIn: true,
    automationLevel: 'L3',
  },
]
