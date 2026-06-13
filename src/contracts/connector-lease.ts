import { z } from "zod"
import {
  IdSchema,
  RiskLevelSchema,
  TimestampSchema,
  VersionSchema,
} from "./shared"

/** ConnectorLease 独立契约版本。 */
export const CONNECTOR_LEASE_VERSION = "1.0.0"

/** 租约状态。 */
export const LeaseStatusSchema = z.enum(["active", "expired", "revoked"])
export type LeaseStatus = z.infer<typeof LeaseStatusSchema>

/**
 * ConnectorLease —— 连接器使用租约（Hermes 授予 Runtime 在限定窗口内使用某连接器）。
 *
 * 用于约束连接器执行的时间窗口、作用域与风险上限，配合幂等键与审批流（AGENTS §3.4 / §6）。
 */
export const ConnectorLeaseSchema = z.object({
  /** 租约唯一 ID。 */
  leaseId: IdSchema,
  /** 关联任务 ID。 */
  taskId: IdSchema,
  /** 租户 / 工作区 ID（租约是 Workspace 级授权，见 AGENTS §6.1 RBAC 与租户边界；不同于 CapabilityRegistration 的 Runtime 级作用域）。 */
  workspaceId: IdSchema,
  /** 被租用的连接器 ID。 */
  connectorId: IdSchema,
  /** 持有租约的运行时 ID。 */
  runtimeId: IdSchema,
  /** 授予时刻（ISO-8601）。 */
  grantedAt: TimestampSchema,
  /** 到期时刻（ISO-8601）。 */
  expiresAt: TimestampSchema,
  /** 允许的操作作用域（如 read / send / write）。 */
  scope: z.array(IdSchema).min(1),
  /** 租约允许的最高风险等级。 */
  maxRiskLevel: RiskLevelSchema,
  /** 租约状态。 */
  status: LeaseStatusSchema,
  /** 契约版本。 */
  version: VersionSchema,
})

export type ConnectorLease = z.infer<typeof ConnectorLeaseSchema>
