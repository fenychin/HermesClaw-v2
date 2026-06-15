/**
 * @deprecated 本文件已迁移至 src/lib/industry-pack-sdk/。
 *
 * 保留为兼容 shim：让仍然 import 旧路径的代码可继续编译，
 * 直到下一次 sweep 全部改 import 后再删除。
 *
 * 新代码请直接 import:
 *   import { ... } from "@hermesclaw/industry-pack-sdk"
 *   或 import { ... } from "@/lib/industry-pack-sdk"
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
  clearCache,
  clearManifestCache,
  PackWorkflowAssetSchema,
  PackAgentAssetSchema,
  mapLegacyManifest,
} from "@/lib/industry-pack-sdk"

export type {
  PackWorkflowAsset,
  PackAgentAsset,
} from "@/lib/industry-pack-sdk"
