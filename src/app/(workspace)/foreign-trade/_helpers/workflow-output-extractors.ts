/**
 * 工作流输出抽取器（前端视图层入口）
 *
 * ⚠️ 此文件已完成解耦重构：
 * - 提取逻辑已迁移至 src/lib/industry-pack-sdk/output-extractors.ts（SDK 层）
 * - 输出结构契约已声明至 industry-packs/foreign-trade/schemas/workflow-outputs.yaml
 * - 此文件作为转发层保留，维持现有 import 路径兼容性
 *
 * 推荐：新代码应直接从 SDK 导入：
 *   import { extractWorkflowDevLetter, extractWorkflowGradeInfo } from "@/lib/industry-pack-sdk"
 *
 * 遵循 CLAUDE.md §3.2 §6.1：
 * - 业务提取逻辑不应散落在视图层私有 helper
 * - 行业包输出结构应在 industry-packs 资产中声明
 */

export {
  extractWorkflowDevLetter as extractDevLetter,
  extractWorkflowGradeInfo as extractGradeInfo,
  type WorkflowDevLetterDraft as DevLetterDraft,
  type WorkflowGradeInfo as GradeInfo,
} from "@/lib/industry-pack-sdk/output-extractors"
