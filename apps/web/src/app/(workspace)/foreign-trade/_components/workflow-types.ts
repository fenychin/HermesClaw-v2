/**
 * 外贸工作流 — 卡片元数据类型
 *
 * P1-5 重构：原本与静态字面量同居于 _data/workflows.ts；
 *   字面量已被删除，类型保留在此（_components 与 _data 共用）。
 *   类型字段与 industry-pack-sdk 的 WorkflowMetaSchema 同步。
 */

export interface TradeWorkflow {
  /** 工作流唯一标识，用于路由跳转 /foreign-trade/workflows/[id] */
  id: string
  /** 工作流名称 */
  title: string
  /** 工作流简要描述 */
  description: string
  /** Lucide 图标名称（字符串，由 WorkflowCard 动态解析） */
  icon?: string
}
