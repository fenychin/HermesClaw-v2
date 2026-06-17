/**
 * @hermesclaw/openclaw-adapter
 * OpenClaw Execution Runtime Adapter — 三域原则第二域
 *
 * 此包是 OpenClaw 上游服务的唯一适配层。
 * 禁止在此包中：
 * - 修改 TaskEnvelope 的 intent/plan 字段（Hermes 权限）
 * - 实现记忆管理或工作流编排（Hermes 权限）
 * - 直接暴露 OpenClaw 内部 API 给前端（必须经过 hermes-kernel 调度）
 * - 含 React/Next/前端 UI 依赖
 *
 * 导出：
 * - createOpenClawAdapter() — 主要的执行适配器工厂函数
 * - ExecutionAdapter 接口 — dispatch / subscribe / getStatus
 * - createGatewayClient() — 轻量级 gateway 客户端（通道消息发送）
 * - OpenClawHttpClient — 完整 HTTP 客户端类（高级用法）
 * - getConnectors / updateConnector — 连接器管理（从主应用 API 路由调用）
 */

// 主执行适配器
export { createOpenClawAdapter } from './executor'
export type { ExecutionAdapter } from './executor'

// Skill Executor — 技能测试执行
export { executeSkillTest } from './executor/skill-executor'
export type {
  SkillRecord,
  SkillTestInput,
  SkillExecutorDeps,
  SkillTestResult,
} from './executor/skill-executor'

// ExecutionEvent 统一构造工厂（唯一的事件构造点，禁止外部直接字面量构造）
export { createExecutionEvent } from './executor/event-factory'
export type { CreateExecutionEventParams } from './executor/event-factory'

// Gateway HTTP 客户端
export { OpenClawHttpClient } from './gateway/client'
export { createGatewayClient } from './gateway'

// 事件发射器（供高级用户/自定义发布代理）
export {
  emitEvent,
  subscribeEvents,
  unsubscribeEvents,
  getSubscriberCount,
  sendHeartbeat,
  registerEventPublisher,
} from './event-emitter'
export type { EventPublisher, EventSubscriptionFilter } from './event-emitter'

// 执行总线（供高级用户/自定义事件订阅）
export {
  subscribeExecutionEvents,
  emitBusEvent,
  dispatchTask,
} from './execution-bus'
export type { ExecutorCallback } from './execution-bus'

// 连接器管理
export { getConnectors, updateConnector } from './client/openclaw-client'

// 类型
export type {
  OpenClawAdapterConfig,
  OpenClawExecuteTaskRequest,
  OpenClawTaskResult,
  OpenClawTaskStatus,
  OpenClawConnectorStatus,
  OpenClawConnectorHealth,
  OpenClawSyncDataRequest,
  OpenClawSyncResult,
  OpenClawSyncStatus,
} from './types'
