/**
 * HarnessBundle 状态机（重导出兼容层）
 *
 * 实际实现在 src/lib/server/harness/bundle-state-machine.ts。
 * 本文件仅做 re-export 维持原 import 路径不破，便于渐进迁移。
 */
export {
  isValidTransition,
  validateTransition,
  getAvailableTransitions,
  InvalidTransitionError,
} from "@/lib/server/harness/bundle-state-machine"
