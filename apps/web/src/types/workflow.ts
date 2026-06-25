/**
 * 工作流（Workflow）通用类型定义
 * —— 对应外贸工作流详情页数据结构，可扩展到其他行业工作流
 */

/** 工作流步骤状态 */
export type WorkflowStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'waiting'

/** 工作流整体运行状态 */
export type WorkflowRunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'waiting'

/** 步骤输入控件类型 */
export type WorkflowInputType = 'text' | 'textarea' | 'select' | 'file'

/** 步骤输出展示类型 */
export type WorkflowOutputType = 'text' | 'markdown' | 'file' | 'table'

/** 下拉选项 */
export interface SelectOption {
  label: string
  value: string
}

/**
 * 步骤输入字段定义
 * —— 在执行到该步骤时，底部表单按此渲染对应控件
 */
export interface WorkflowInput {
  key: string
  label: string
  type: WorkflowInputType
  required: boolean
  placeholder?: string
  /** 仅 type === 'select' 时有效 */
  options?: SelectOption[]
  /** 运行态时合并的用户已输入的值 */
  value?: string
}

/**
 * 步骤输出字段定义
 * —— 步骤执行完后，在卡片内按 type 渲染输出内容
 */
export interface WorkflowOutput {
  key: string
  label: string
  type: WorkflowOutputType
  /** 执行完成后填充；pending/running 时为空 */
  value?: string
}

/**
 * 工作流步骤
 */
export interface WorkflowStep {
  id: string
  title: string
  description: string
  status: WorkflowStepStatus
  /** 该步骤需要用户填写的输入字段 */
  inputs?: WorkflowInput[]
  /** 该步骤执行后产生的输出字段 */
  outputs?: WorkflowOutput[]
  /** 执行耗时（秒），completed 后填充 */
  durationSec?: number
}

/**
 * 工作流定义
 * —— 通过 id 与路由 /foreign-trade/workflows/[id] 对应
 */
export interface Workflow {
  id: string
  title: string
  description: string
  steps: WorkflowStep[]
  /** 运行状态（页面初始化时为 idle） */
  runStatus?: WorkflowRunStatus
}
