/**
 * Mobile preview fixtures —— 通知流
 *
 * ⚠️ MOBILE PREVIEW — PRD §9.3 暂缓项，UI 在 fixture 数据上演示。
 * 该数据仅供 (mobile) 路由组在 NEXT_PUBLIC_ENABLE_MOBILE_PREVIEW=true
 * 时演示用，**禁止**被任何 (workspace) / Hermes Core / OpenClaw 服务端代码引用。
 */

/** 通知事件类型 */
export type MobileNotificationType =
  | "task:started"
  | "task:completed"
  | "task:failed"
  | "approval:requested"
  | "approval:resolved"
  | "email:received"
  | "system:alert"
  | "system:info"

/** 通知数据模型 */
export interface MobileNotification {
  id: string
  type: MobileNotificationType
  title: string
  description: string
  timestamp: string
  read: boolean
  agentId?: string
}

export const MOCK_NOTIFICATIONS: MobileNotification[] = [
  {
    id: "notif-001",
    type: "task:completed",
    title: "报价方案已生成",
    description: "鸿达纺织 CFR 报价单已自动生成，等待审查发送",
    timestamp: "3 分钟前",
    read: false,
    agentId: "agent-ft-cost",
  },
  {
    id: "notif-002",
    type: "approval:requested",
    title: "新 Harness 升级提案待审批",
    description: "邮件回复策略 L2→L3 升级提案已提交，置信度 92%",
    timestamp: "8 分钟前",
    read: false,
    agentId: "agent-mail",
  },
  {
    id: "notif-003",
    type: "email:received",
    title: "新客户询盘",
    description: "来自德国 Hamburg GmbH 的电子元器件采购询盘",
    timestamp: "15 分钟前",
    read: false,
  },
  {
    id: "notif-004",
    type: "task:started",
    title: "客户画像分析已启动",
    description: "正在从 LinkedIn + 海关数据提取目标客户画像",
    timestamp: "32 分钟前",
    read: true,
    agentId: "agent-ft-profile",
  },
  {
    id: "notif-005",
    type: "system:alert",
    title: "信用证不符点预警",
    description: "东莞凯利皮具 LC 条款中装船日期与合同不一致",
    timestamp: "1 小时前",
    read: true,
  },
  {
    id: "notif-006",
    type: "approval:resolved",
    title: "自动报价升级提案已通过",
    description: "报价引擎 L2→L4 升级（自动生成+人工确认）已批准",
    timestamp: "2 小时前",
    read: true,
  },
  {
    id: "notif-007",
    type: "task:failed",
    title: "竞品分析数据采集失败",
    description: "目标网站反爬机制触发，已切换备用数据源重试",
    timestamp: "3 小时前",
    read: true,
    agentId: "agent-ft-compete",
  },
  {
    id: "notif-008",
    type: "system:info",
    title: "每日简报已生成",
    description: "今日外贸行业动态摘要：RCEP 原产地规则更新",
    timestamp: "5 小时前",
    read: true,
  },
]
