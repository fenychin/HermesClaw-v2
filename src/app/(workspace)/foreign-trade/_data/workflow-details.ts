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
// 工作流详情索引（按 id 索引）
// ============================================================

/** 所有工作流详情的 Map，用于 O(1) 查找 */
const WORKFLOW_DETAILS_MAP: Map<string, Workflow> = new Map([
  [INQUIRY_GRADE_WORKFLOW.id, INQUIRY_GRADE_WORKFLOW],
  [DEV_LETTER_WORKFLOW.id, DEV_LETTER_WORKFLOW],
])

/**
 * 根据 id 查询工作流详情
 * @returns 对应 Workflow，或 undefined（无数据时页面显示 EmptyState）
 */
export function getWorkflowById(id: string): Workflow | undefined {
  return WORKFLOW_DETAILS_MAP.get(id)
}
