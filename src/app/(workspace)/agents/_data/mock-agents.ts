export interface AgentData {
  id: string;
  name: string;
  role: string;
  status: 'active' | 'idle' | 'error';
  tags: string[];
  taskCount: number;
  isBuiltIn: boolean;
}

// 外贸内置智能体 mock 数据
export const mockAgents: AgentData[] = [
  {
    id: 'a1',
    name: '外贸销售助手',
    role: '客户开发与跟进',
    status: 'active',
    tags: ['邮件撰写', '需求分析', '多语言'],
    taskCount: 154,
    isBuiltIn: true,
  },
  {
    id: 'a2',
    name: '询盘分拣员',
    role: '自动分类与评级',
    status: 'active',
    tags: ['NLP', '打分模型', '自动化'],
    taskCount: 890,
    isBuiltIn: true,
  },
  {
    id: 'a3',
    name: '客户跟进员',
    role: '生命周期维护',
    status: 'idle',
    tags: ['日程提醒', '关怀邮件'],
    taskCount: 45,
    isBuiltIn: true,
  },
  {
    id: 'a4',
    name: '报价代理',
    role: '智能生成报价单',
    status: 'active',
    tags: ['表格处理', '核算成本'],
    taskCount: 312,
    isBuiltIn: true,
  },
  {
    id: 'a5',
    name: '邮件写作员',
    role: '专业外贸邮件生成',
    status: 'active',
    tags: ['高转化率', '本地化表达'],
    taskCount: 1205,
    isBuiltIn: true,
  },
  {
    id: 'a6',
    name: '产品资料员',
    role: '整理商品详情与规格',
    status: 'idle',
    tags: ['知识库检索', '多语言翻译'],
    taskCount: 78,
    isBuiltIn: true,
  },
  {
    id: 'a7',
    name: '市场研究员',
    role: '竞品与行业趋势分析',
    status: 'error',
    tags: ['Web Search', '研报生成'],
    taskCount: 12,
    isBuiltIn: true,
  },
  {
    id: 'a8',
    name: '风险审查员',
    role: '客户背景与合规风险排查',
    status: 'active',
    tags: ['风控模型', '数据清洗'],
    taskCount: 56,
    isBuiltIn: true,
  }
];
