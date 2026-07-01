/**
 * POST /api/intelligence/skill-test/[skillId]
 *
 * Phase 2 端到端验证端点：手动触发单个 Industry Intelligence skill 并查看真实输出。
 *
 * 仅开发环境可用，用于诊断 Tavily + DeepSeek 接入是否生效。
 *
 * 用法：
 *   curl -X POST http://localhost:3000/api/intelligence/skill-test/skill-radar-score-compute
 *
 * 返回：
 *   - mode: "llm+tavily" → 真实接入生效（dimensions[i].reasoning 含具体新闻、sourceUrls 有 URL）
 *   - mode: "db-fallback" → Key 未配置或上游失败，走的是 DB 统计降级路径
 */
import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { SKILL_EXEC_MAP, type SkillExecContext } from "@/lib/server/agent-runtime/skill-executor"
import { isTavilyAvailable } from "@hermesclaw/openclaw-adapter"
import { isProviderAvailable } from "@/lib/server/llm-provider"
import { logger } from "@/lib/logger"

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ skillId: string }> },
): Promise<Response> {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "此端点仅开发环境可用" },
      { status: 403 },
    )
  }

  const { skillId } = await params
  const executor = SKILL_EXEC_MAP[skillId]
  if (!executor) {
    return NextResponse.json(
      {
        success: false,
        error: `未知 skill: ${skillId}`,
        availableSkills: Object.keys(SKILL_EXEC_MAP),
      },
      { status: 404 },
    )
  }

  // 环境健康检查
  const envCheck = {
    tavilyConfigured: isTavilyAvailable(),
    deepseekConfigured: isProviderAvailable("deepseek"),
    anthropicConfigured: isProviderAvailable("anthropic"),
  }

  const ctx: SkillExecContext = {
    workspaceId: "default",
    industryId: "industry-intelligence-v2",
    agentId: "A1",
    prisma,
  }

  const t0 = Date.now()
  try {
    const result = await executor(undefined, ctx)
    const durationMs = Date.now() - t0

    logger.info("[SkillTest] 完成", {
      skillId,
      status: result.status,
      durationMs,
      envCheck,
    })

    return NextResponse.json({
      success: true,
      skillId,
      durationMs,
      envCheck,
      result,
    })
  } catch (err) {
    logger.error("[SkillTest] 失败", {
      skillId,
      error: err instanceof Error ? err.message : String(err),
    })
    return NextResponse.json(
      {
        success: false,
        skillId,
        envCheck,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 500 },
    )
  }
}
