import { z } from "zod"
import {
  IdSchema,
  RiskLevelSchema,
  VersionSchema,
} from "./shared"

/** CapabilityRegistration 独立契约版本。 */
export const CAPABILITY_REGISTRATION_VERSION = "1.0.0"

/**
 * CapabilityRegistration —— 能力注册（OpenClaw Runtime → Hermes）。
 *
 * Runtime 向 Hermes 注册其可执行的能力（AGENTS §2.2 / CLAUDE §5.1 Runtime capability registration）。
 * Hermes 据此路由动作；不得绕过此注册直接调用未声明能力。
 */
export const CapabilityRegistrationSchema = z.object({
  /** 能力唯一 ID。 */
  capabilityId: IdSchema,
  /** 提供该能力的运行时 ID。 */
  runtimeId: IdSchema,
  /** 可读名称（可选）。 */
  displayName: z.string().optional(),
  /** 支持的动作类型（与 TaskEnvelope.actionType 对应）。 */
  actionTypes: z.array(IdSchema).min(1),
  /** 该能力涉及的连接器 ID 列表（可选）。 */
  connectorIds: z.array(IdSchema).default([]),
  /** 该能力可承载的最高风险等级。 */
  maxRiskLevel: RiskLevelSchema,
  /** 兼容的 Hermes API 版本（AGENTS §6.x / IndustryPack 兼容性同构）。 */
  compatibleHermesApi: VersionSchema,
  /** 契约版本。 */
  version: VersionSchema,
})

export type CapabilityRegistration = z.infer<typeof CapabilityRegistrationSchema>
