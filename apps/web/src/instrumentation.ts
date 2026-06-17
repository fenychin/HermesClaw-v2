/**
 * Next.js Instrumentation Hook — 进程级引导入口
 *
 * 三域原则（CLAUDE.md §3.2、§6.1）：
 * 在服务端进程启动时，将主应用的审计实现注入到 industry-pack-sdk，
 * 彻底切除 SDK 对 @/lib/server/audit 的反向依赖。
 *
 * 该文件仅在 Node.js runtime（服务端）执行，不会被客户端打包。
 */
export async function register() {
  // 仅在服务端执行
  if (process.env.NEXT_RUNTIME === "nodejs" || typeof window === "undefined") {
    try {
      const { configureIndustryPackLoader } = await import("@hermesclaw/industry-pack-sdk")
      const { writeAuditLog } = await import("@/lib/server/audit")

      configureIndustryPackLoader({
        onAuditLog: async (event) => {
          await writeAuditLog({
            actor: "system",
            action: `industry.pack.${event.type.toLowerCase()}`,
            targetType: "industry-pack",
            targetId: event.packId,
            detail: `${event.type}: ${event.packId}${event.detail ? ` (${JSON.stringify(event.detail)})` : ""}`,
            riskLevel: "medium",
            workspaceId: "default",
          })
        },
        onLoadError: (packId, error) => {
          console.error(`[IndustryPackSDK] 加载失败: ${packId}`, error)
        },
      })

      console.log("[Instrumentation] IndustryPackSDK DI bootstrap complete")
    } catch (error) {
      console.error("[Instrumentation] IndustryPackSDK DI bootstrap failed:", error)
    }
  }
}
