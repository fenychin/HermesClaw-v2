/**
 * OpenClaw Gateway — 统一导出
 *
 * 提供与 OpenClaw API 通信的 HTTP 客户端及其配置类型。
 */

export { OpenClawHttpClient } from './client'
export { createGatewayClient } from './gateway-client'
export type {
  OpenClawAdapterConfig,
  OpenClawExecuteTaskRequest,
  OpenClawTaskResult,
  OpenClawConnectorStatus,
  OpenClawConnectorHealth,
  OpenClawSyncDataRequest,
  OpenClawSyncResult,
  OpenClawSyncStatus,
} from '../types'
