/**
 * OpenClaw Gateway Client — 轻量级通道消息发送接口
 *
 * 为通道/设备层提供简化 API：sendMessage(channelId, content) → boolean
 * 不暴露 HTTP 细节，适合前端/控制层直接调用。
 *
 * 注意：此模块仅负责消息推送，不做策略判定。
 */

export interface GatewayClient {
  /** 向指定通道发送消息文本 */
  sendMessage(channelId: string, content: string): Promise<boolean>
}

/**
 * 创建 Gateway 客户端实例。
 *
 * @param config - 基础 URL 配置
 * @returns GatewayClient 实例
 */
export function createGatewayClient(config: { baseUrl: string }): GatewayClient {
  const baseUrl = config.baseUrl.replace(/\/$/, '')

  return {
    async sendMessage(channelId: string, content: string): Promise<boolean> {
      try {
        const res = await fetch(`${baseUrl}/api/gateway/${channelId}/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content }),
          signal: AbortSignal.timeout(10_000),
        })

        if (!res.ok) {
          console.error(`[GatewayClient] 消息发送失败: HTTP ${res.status} ${res.statusText}`)
          return false
        }

        const data = await res.json().catch(() => ({}))
        return data?.success === true || data?.ok === true || res.ok
      } catch (error) {
        console.error(
          `[GatewayClient] 消息发送异常: ${error instanceof Error ? error.message : String(error)}`,
        )
        return false
      }
    },
  }
}
