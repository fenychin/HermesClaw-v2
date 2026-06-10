/**
 * 外贸工作流详情 Mock 数据
 * —— 按 workflow.id 与路由 /foreign-trade/workflows/[id] 对应
 * —— 每个 Workflow 对象含完整步骤（含 inputs / outputs）
 */

import type { Workflow } from '@/types/workflow'

// ============================================================
// 询盘分级 工作流
// ============================================================
const INQUIRY_GRADE_WORKFLOW: Workflow = {
  id: 'inquiry-grade',
  title: '询盘分级',
  description: '自动对询盘内容进行质量评估，识别高意向客户，优先分配跟进资源',
  runStatus: 'idle',
  steps: [
    {
      id: 'input-inquiry',
      title: '输入询盘内容',
      description: '粘贴客户询盘邮件原文',
      status: 'pending',
      inputs: [
        {
          key: 'inquiry_text',
          label: '询盘原文',
          type: 'textarea',
          required: true,
          placeholder: '粘贴客户询盘邮件内容...',
        },
        {
          key: 'customer_country',
          label: '客户国家',
          type: 'select',
          required: false,
          options: [
            { label: '美国', value: 'US' },
            { label: '德国', value: 'DE' },
            { label: '英国', value: 'GB' },
            { label: '法国', value: 'FR' },
            { label: '澳大利亚', value: 'AU' },
            { label: '加拿大', value: 'CA' },
            { label: '日本', value: 'JP' },
            { label: '韩国', value: 'KR' },
            { label: '印度', value: 'IN' },
            { label: '巴西', value: 'BR' },
            { label: '俄罗斯', value: 'RU' },
            { label: '阿联酋', value: 'AE' },
            { label: '沙特阿拉伯', value: 'SA' },
            { label: '其他', value: 'OTHER' },
          ],
        },
        {
          key: 'product_line',
          label: '产品线',
          type: 'text',
          required: false,
          placeholder: '如：太阳能板、LED灯具',
        },
      ],
    },
    {
      id: 'ai-analysis',
      title: 'AI 质量分析',
      description: 'HermesClaw 分析询盘意向度与需求明确性',
      status: 'pending',
      outputs: [
        { key: 'grade', label: '询盘等级', type: 'text' },
        { key: 'score', label: '综合评分', type: 'text' },
        { key: 'analysis', label: '分析摘要', type: 'markdown' },
        { key: 'suggested_action', label: '建议动作', type: 'text' },
      ],
    },
    {
      id: 'assign-action',
      title: '分配跟进动作',
      description: '确认跟进策略并创建任务',
      status: 'pending',
      inputs: [
        {
          key: 'confirm_action',
          label: '跟进方式',
          type: 'select',
          required: true,
          options: [
            { label: '立即回复（高优先级）', value: 'urgent' },
            { label: '今日回复（普通优先级）', value: 'normal' },
            { label: '暂缓跟进', value: 'defer' },
          ],
        },
      ],
    },
  ],
}

// ============================================================
// 开发信生成 工作流
// ============================================================
const DEV_LETTER_WORKFLOW: Workflow = {
  id: 'dev-letter',
  title: '开发信生成',
  description: '基于客户信息与产品特点，生成个性化外贸开发信',
  runStatus: 'idle',
  steps: [
    {
      id: 'customer-info',
      title: '填写客户信息',
      description: '输入客户基本信息',
      status: 'pending',
      inputs: [
        { key: 'company_name', label: '客户公司名', type: 'text', required: true, placeholder: 'ABC Trading Co.' },
        { key: 'country', label: '所在国家', type: 'text', required: true, placeholder: '美国、德国...' },
        { key: 'business_type', label: '业务类型', type: 'select', required: true, options: [
          { label: '进口商/贸易商', value: 'importer' },
          { label: '品牌商/制造商', value: 'brand' },
          { label: '零售商', value: 'retailer' },
          { label: '工程商', value: 'engineer' }
        ]},
        { key: 'pain_points', label: '客户痛点/需求（选填）', type: 'textarea', required: false, placeholder: '已了解到的客户需求或痛点...' }
      ]
    },
    {
      id: 'product-select',
      title: '选择推介产品',
      description: '选择拟推介产品',
      status: 'pending',
      inputs: [
        { key: 'product_name', label: '产品名称', type: 'text', required: true },
        { key: 'key_advantages', label: '核心优势（每行一条）', type: 'textarea', required: true, placeholder: '如：\n通过CE/UL认证\n最小起订量500pcs\n14天快速打样' },
        { key: 'tone', label: '邮件语气', type: 'select', required: true, options: [
          { label: '专业正式', value: 'formal' },
          { label: '友好亲切', value: 'friendly' },
          { label: '简洁直接', value: 'concise' }
        ]}
      ]
    },
    {
      id: 'generate-letter',
      title: 'AI 生成开发信',
      description: '系统自动生成初稿',
      status: 'pending',
      outputs: [
        { key: 'subject', label: '邮件主题', type: 'text' },
        { key: 'body', label: '邮件正文', type: 'markdown' }
      ]
    },
    {
      id: 'review-edit',
      title: '审阅与编辑',
      description: '人工审阅开发信正文',
      status: 'pending',
      inputs: [
        { key: 'edited_body', label: '编辑邮件正文', type: 'textarea', required: true }
      ]
    }
  ],
}

// ============================================================
// 客户画像构建 工作流
// ============================================================
const CUSTOMER_PROFILE_WORKFLOW: Workflow = {
  id: 'customer-profile',
  title: '客户画像构建',
  description: '整合多渠道信息，生成完整客户档案',
  runStatus: 'idle',
  steps: [
    {
      id: 'step-n1-profile',
      title: 'AI 客户画像构建',
      description: '输入客户公司名与基本信息，AI 自动构建完整画像',
      status: 'pending',
      inputs: [
        { key: 'company_name', label: '客户公司名', type: 'text', required: true, placeholder: '如：BrightPath Trading LLC' },
        { key: 'country', label: '所在国家', type: 'text', required: true, placeholder: '美国、德国...' },
        { key: 'business_type', label: '业务类型', type: 'select', required: true, options: [
          { label: '进口商/贸易商', value: 'importer' },
          { label: '品牌商/制造商', value: 'brand' },
          { label: '零售商', value: 'retailer' },
          { label: '工程商', value: 'engineer' },
        ]},
      ],
    },
  ],
}

// ============================================================
// 报价生成 工作流
// ============================================================
const QUOTE_GEN_WORKFLOW: Workflow = {
  id: 'quote-gen',
  title: '报价生成',
  description: '根据产品与客户条件快速生成报价单',
  runStatus: 'idle',
  steps: [
    {
      id: 'step-n1-cost',
      title: '成本核算',
      description: '输入产品参数，自动核算多贸易术语成本',
      status: 'pending',
      inputs: [
        { key: 'product_name', label: '产品名称', type: 'text', required: true },
        { key: 'quantity', label: '数量', type: 'text', required: true, placeholder: '如：500pcs' },
        { key: 'target_market', label: '目标市场', type: 'text', required: true, placeholder: '欧盟、美国...' },
      ],
    },
    {
      id: 'step-n2-pdf',
      title: '生成报价单',
      description: 'AI 自动生成专业报价单',
      status: 'pending',
    },
  ],
}

// ============================================================
// 样品管理 工作流
// ============================================================
const SAMPLE_MGMT_WORKFLOW: Workflow = {
  id: 'sample-mgmt',
  title: '样品管理',
  description: '跟踪样品寄送状态与客户反馈',
  runStatus: 'idle',
  steps: [
    {
      id: 'step-n1-dispatch',
      title: '登记样品寄送',
      description: '记录样品寄送信息',
      status: 'pending',
      inputs: [
        { key: 'customer_name', label: '客户名称', type: 'text', required: true },
        { key: 'sample_items', label: '样品清单', type: 'textarea', required: true, placeholder: '每行一个样品...' },
        { key: 'tracking_number', label: '快递单号', type: 'text', required: false },
      ],
    },
    {
      id: 'step-n2-track',
      title: '追踪物流状态',
      description: '自动查询物流进度',
      status: 'pending',
    },
    {
      id: 'step-n3-feedback',
      title: '记录客户反馈',
      description: '登记客户对样品的反馈意见',
      status: 'pending',
      inputs: [
        { key: 'feedback', label: '客户反馈', type: 'textarea', required: false, placeholder: '质量 / 价格 / 交期反馈...' },
      ],
    },
  ],
}

// ============================================================
// 订单推进 工作流
// ============================================================
const ORDER_PUSH_WORKFLOW: Workflow = {
  id: 'order-push',
  title: '订单推进',
  description: '监控订单进度并自动提醒关键节点',
  runStatus: 'idle',
  steps: [
    {
      id: 'step-n1-status',
      title: '订单状态快照',
      description: '记录当前订单进度',
      status: 'pending',
      inputs: [
        { key: 'order_id', label: '订单编号', type: 'text', required: true },
        { key: 'current_stage', label: '当前阶段', type: 'select', required: true, options: [
          { label: '备料中', value: 'material-prep' },
          { label: '排产中', value: 'production' },
          { label: '待验货', value: 'inspection' },
          { label: '待出运', value: 'shipping' },
        ]},
      ],
    },
    {
      id: 'step-n2-check',
      title: '关键节点检查',
      description: '检查各节点完成情况',
      status: 'pending',
    },
    {
      id: 'step-n3-remind',
      title: '生成提醒任务',
      description: '自动生成关键节点提醒',
      status: 'pending',
    },
  ],
}

// ============================================================
// 展会线索整理 工作流
// ============================================================
const EXHIBITION_LEADS_WORKFLOW: Workflow = {
  id: 'exhibition-leads',
  title: '展会线索整理',
  description: '整理展会名片与线索，自动分级跟进',
  runStatus: 'idle',
  steps: [
    {
      id: 'step-n1-sort',
      title: '线索分类分级',
      description: '输入展会收集的线索信息，AI 自动分类分级',
      status: 'pending',
      inputs: [
        { key: 'leads_text', label: '线索内容', type: 'textarea', required: true, placeholder: '粘贴展会收集的名片信息 / 客户需求记录...' },
        { key: 'exhibition_name', label: '展会名称', type: 'text', required: false, placeholder: '如：广交会第137届' },
      ],
    },
    {
      id: 'step-n2-plan',
      title: '生成跟进计划',
      description: '按优先级生成分天跟进计划',
      status: 'pending',
    },
  ],
}

// ============================================================
// 客户跟进提醒 工作流
// ============================================================
const FOLLOWUP_REMIND_WORKFLOW: Workflow = {
  id: 'followup-remind',
  title: '客户跟进提醒',
  description: '根据跟进周期自动发送提醒任务',
  runStatus: 'idle',
  steps: [
    {
      id: 'step-n1-analyze',
      title: '客户跟进分析',
      description: '输入客户信息，AI 分析跟进状态并生成建议',
      status: 'pending',
      inputs: [
        { key: 'customer_name', label: '客户名称', type: 'text', required: true },
        { key: 'last_contact', label: '上次联系时间', type: 'text', required: true, placeholder: '如：5天前 / 2026-06-01' },
        { key: 'current_stage', label: '当前阶段', type: 'select', required: true, options: [
          { label: '初次询盘', value: 'initial' },
          { label: '报价后跟进', value: 'quoted' },
          { label: '样品阶段', value: 'sample' },
          { label: '谈判中', value: 'negotiation' },
          { label: '待下单', value: 'order-pending' },
        ]},
      ],
    },
  ],
}

// ============================================================
// 工作流详情索引（按 id 索引）
// ============================================================

/** 所有工作流详情的 Map，用于 O(1) 查找（作为 DB 数据不可用时的静态回退） */
const WORKFLOW_DETAILS_MAP: Map<string, Workflow> = new Map([
  [INQUIRY_GRADE_WORKFLOW.id, INQUIRY_GRADE_WORKFLOW],
  [DEV_LETTER_WORKFLOW.id, DEV_LETTER_WORKFLOW],
  [CUSTOMER_PROFILE_WORKFLOW.id, CUSTOMER_PROFILE_WORKFLOW],
  [QUOTE_GEN_WORKFLOW.id, QUOTE_GEN_WORKFLOW],
  [SAMPLE_MGMT_WORKFLOW.id, SAMPLE_MGMT_WORKFLOW],
  [ORDER_PUSH_WORKFLOW.id, ORDER_PUSH_WORKFLOW],
  [EXHIBITION_LEADS_WORKFLOW.id, EXHIBITION_LEADS_WORKFLOW],
  [FOLLOWUP_REMIND_WORKFLOW.id, FOLLOWUP_REMIND_WORKFLOW],
])

/**
 * 根据 id 查询工作流详情
 * @returns 对应 Workflow，或 undefined（无数据时页面显示 EmptyState）
 */
export function getWorkflowById(id: string): Workflow | undefined {
  return WORKFLOW_DETAILS_MAP.get(id)
}
