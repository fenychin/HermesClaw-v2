/**
 * Harness 自演化引擎 —— 评估核心入口（P2-3 已拆分为 harness/* 子模块）。
 *
 * 拆分后实际实现位于：
 *   - harness/eval-window.ts  评估窗口数据采集
 *   - harness/metrics.ts      纯函数与触发判断
 *   - harness/report-builder.ts  EvaluationReport 组装、EvolutionLog 写入、output-guard
 *   - harness/orchestrator.ts 流程编排（runHarnessEvaluation 主入口）
 *
 * 本文件仅做 re-export 维持原 import 路径不破，便于渐进迁移。
 */

export {
  runHarnessEvaluation,
  type HarnessEvalDeps,
} from "@/lib/server/harness/orchestrator"

export {
  EVAL_WINDOW_HOURS,
  isTrendingUp,
  isErrorStatus,
  buildLogSummary,
  computeMetrics,
} from "@/lib/server/harness/metrics"

export { buildEvaluationReport } from "@/lib/server/harness/report-builder"
