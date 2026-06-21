/**
 * Zustand 状态管理导出中心
 * 
 * 严格划分三个独立 Store 以维护三域原则：
 * 
 * 1. agentConfigStore：只持有配置态数据，包含可用智能体列表摘要，禁止混入任何会话状态。
 * 2. sessionStore：管理纯前端会话消息列表和 WebSocket 接收到的执行事件流，禁止混入 AgentPolicy 的完整策略对象。
 * 3. sessionContextStore：唯一的跨域桥接通道，基于 SessionContext 契约，仅传递 agentId 字符串，用作前后端安全隔离。
 * 
 * 🚫 严禁在这三个前端 store 内出现任何属于后端的安全授权与策略控制相关字段。
 */

export { useSessionStore } from "./session-store";
export { useAgentConfigStore } from "./agent-config-store";
export { useSessionContextStore } from "./session-context-store";

export type { AgentTemplateSummary } from "./agent-config-store";
