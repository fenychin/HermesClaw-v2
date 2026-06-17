/**
 * Industry Pack SDK — 公开出口
 *
 * 在 v0.x 阶段以 src/lib/industry-pack-sdk 形式存在，未来（v0.13+）演进为
 * packages/industry-pack-sdk 时，外部 import 路径 `@hermesclaw/industry-pack-sdk`
 * 保持不变（见 tsconfig path 别名）。
 *
 * SDK 边界（CLAUDE.md §3.2）：
 * - 只放装载 + 校验 + Schema，不写任何具体行业的业务实现
 * - 不直接 import src/lib/server/* 内部实现，只通过 @/contracts 与文件系统对接
 * - 装载阶段经 zod 强校验，不通过即拒绝
 */

export {
  loadIndustryManifest,
  getCachedManifest,
  listIndustryWorkflows,
  loadIndustryWorkflows,
  loadIndustryWorkflowDag,
  loadIndustryWorkflowSteps,
  loadIndustryWorkflow,
  loadIndustryAgents,
  loadIndustryPrompt,
  loadIndustryDashboards,
  loadIndustryConnectors,
  loadIndustrySkills,
  loadIndustrySchemas,
  loadIndustryEvalRules,
  clearCache,
  clearManifestCache,
  configureIndustryPackLoader,
} from "./loader"

export {
  WorkflowMetaSchema,
  WorkflowDagFileSchema,
  WorkflowStepsFileSchema,
  PackAgentAssetSchema,
  PackWorkflowAssetSchema,
  PackSkillAssetSchema,
} from "./schemas"

export type {
  WorkflowMeta,
  WorkflowDagFile,
  WorkflowStepsFile,
  PackAgentAsset,
  PackWorkflowAsset,
  PackSkillAsset,
} from "./schemas"

export { mapLegacyManifest } from "./legacy-mapper"

export {
  extractWorkflowDevLetter,
  extractWorkflowGradeInfo,
} from "./output-extractors"

export type {
  WorkflowDevLetterDraft,
  WorkflowGradeInfo,
} from "./output-extractors"

export { IndustryPackManifestSchema } from './types'
export type { IndustryPackManifest, IndustryPackLoaderOptions, IndustryPackAuditEvent } from './types'
export { IndustryPackLoader } from './loader'

