/**
 * 三域边界声明
 * 此文件声明每种契约类型归属哪个域
 * 违反此规则将在 code review 中被拒绝
 */
export const DOMAIN_OWNERSHIP = {
  // Hermes Control Kernel 拥有的契约（仅 hermes-kernel 包可写入）
  HERMES_OWNED: [
    'TaskEnvelope',      // 任务分发
    'EvaluationReport',  // Harness 评估
    'EvolutionProposal', // 进化提案
    'MemoryEntry',       // 记忆条目
    'IndustryIntelSnapshot', // 行业情报总快照（Hermes 缓存层）
    'SandboxScenarioRequest', // 沙盘推演请求（Hermes 任务编排）
    'ScenarioResult',    // 沙盘推演结果（Hermes WorkflowRun 汇总裁定）
  ],
  // OpenClaw Execution Runtime 拥有的契约（仅 openclaw-adapter 包可写入）
  OPENCLAW_OWNED: [
    'ExecutionEvent',    // 执行回传
    'ActionReceipt',     // 动作回执
    'ConnectorLease',    // 连接器租约
    'CapabilityRegistration', // 能力注册
    'IntelSSEEvent',     // intel.* SSE 事件流（OpenClaw SSE 发射器）
  ],
  // Industry Pack Layer 可读的契约（只读，不可写入两核心域）
  INDUSTRY_PACK_READABLE: [
    'TaskEnvelope',
    'ExecutionEvent',
    'ActionReceipt',
    'IndustryIntelSnapshot', // A1 产出
    'SandboxScenarioRequest', // A4 消费
    'ScenarioResult',        // A4 产出
    'IntelSSEEvent',         // A1-A5 产出
  ],
} as const
