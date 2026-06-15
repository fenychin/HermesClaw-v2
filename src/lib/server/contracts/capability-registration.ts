import type { ActionType, AutomationLevel, RiskLevel } from './task-envelope';

export type CapabilityType =
  | 'connector'
  | 'skill'
  | 'tool'
  | 'channel'
  | 'device';

export type CapabilityStatus = 'available' | 'degraded' | 'unavailable' | 'unregistered';

export interface CapabilityRegistration {
  capabilityId: string;
  runtimeId: string;            // 所属运行时（OpenClaw 实例 ID）
  workspaceId: string;
  type: CapabilityType;
  name: string;
  version: string;
  status: CapabilityStatus;
  supportedActionTypes: ActionType[];   // 该能力支持的 actionType 列表
  automationLevelCeiling: AutomationLevel;  // 最高允许的自动化等级
  riskLevelCeiling: RiskLevel;              // 最高允许的风险等级
  registeredAt: Date;
  lastHeartbeatAt: Date;
  metadata?: Record<string, unknown>;
}
