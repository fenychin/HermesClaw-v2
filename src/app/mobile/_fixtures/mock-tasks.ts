/**
 * Mobile preview fixtures —— 任务列表
 *
 * ⚠️ MOBILE PREVIEW — PRD §9.3 暂缓项，UI 在 fixture 数据上演示。
 * 该数据仅供 (mobile) 路由组在 NEXT_PUBLIC_ENABLE_MOBILE_PREVIEW=true
 * 时演示用，**禁止**被任何 (workspace) / Hermes Core / OpenClaw 服务端代码引用。
 */

/** 任务状态 */
export type MobileTaskStatus = "pending" | "in_progress" | "completed" | "blocked"

/** 任务数据模型 */
export interface MobileTask {
  id: string
  title: string
  description: string
  status: MobileTaskStatus
  customer: string
  location?: string
  dueTime?: string
  priority: "high" | "medium" | "low"
}

export const MOCK_TASKS: MobileTask[] = [
  {
    id: "task-001",
    title: "拜访深圳德盛进出口有限公司",
    description: "确认 Q3 电子元器件采购意向，交付样品册",
    status: "pending",
    customer: "深圳德盛",
    location: "深圳市南山区科技园路 88 号",
    dueTime: "今日 14:00",
    priority: "high",
  },
  {
    id: "task-002",
    title: "提交鸿达纺织报价方案",
    description: "基于成本核算表生成 CFR 报价单，邮件发送",
    status: "in_progress",
    customer: "鸿达纺织",
    dueTime: "今日 16:30",
    priority: "high",
  },
  {
    id: "task-003",
    title: "审核东莞凯利皮具 LC 条款",
    description: "检查信用证不符点，确认装船日期",
    status: "pending",
    customer: "东莞凯利",
    dueTime: "明日 10:00",
    priority: "medium",
  },
  {
    id: "task-004",
    title: "回访广州天宇机械",
    description: "跟进上次询价，确认设备参数修改意见",
    status: "completed",
    customer: "广州天宇",
    location: "广州市黄埔区",
    dueTime: "昨日 15:00",
    priority: "low",
  },
]
