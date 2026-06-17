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
  ],
  // OpenClaw Execution Runtime 拥有的契约（仅 openclaw-adapter 包可写入）
  OPENCLAW_OWNED: [
    'ExecutionEvent',    // 执行回传
    'ActionReceipt',     // 动作回执
    'ConnectorLease',    // 连接器租约
    'CapabilityRegistration', // 能力注册
  ],
  // Industry Pack Layer 可读的契约（只读，不可写入两核心域）
  INDUSTRY_PACK_READABLE: ['TaskEnvelope', 'ExecutionEvent', 'ActionReceipt'],
} as const
