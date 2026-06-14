/**
 * OpenClaw 移动端环境签到端点
 * —— POST /api/openclaw/checkin
 *
 * 接收外勤销售移动端环境信息（时区、设备类型、视口尺寸、PWA 运行模式），
 * 用于移动端设备在线状态追踪与推送通道优化。
 *
 * 请求体 (JSON)：
 *   {
 *     timezone: string,        // IANA 时区标识（如 "Asia/Shanghai"）
 *     localTime: string,       // ISO 8601 格式本地时间
 *     deviceType: string,      // 设备类型推断结果
 *     userAgent: string,       // 原始 User-Agent
 *     viewportWidth: number,   // 视口宽度 (px)
 *     viewportHeight: number,  // 视口高度 (px)
 *     preferStandalone: boolean // 是否以 PWA Standalone 模式运行
 *   }
 *
 * 响应：
 *   200 { status: "ok", sessionId: string }
 *   429 { status: "error", message: "签到过于频繁" }
 */
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { z } from "zod"

/** 签到频率限制：每个 IP 每分钟最多 3 次签到 */
const CHECKIN_LIMIT = 3;
const CHECKIN_WINDOW_MS = 60_000;

/** 签到请求体 schema */
const CheckinSchema = z.object({
  timezone: z.string().min(1, "缺少必填字段：timezone"),
  localTime: z.string().min(1, "缺少必填字段：localTime"),
  deviceType: z.string().optional(),
  userAgent: z.string().optional(),
  viewportWidth: z.number().optional(),
  viewportHeight: z.number().optional(),
  preferStandalone: z.boolean().optional(),
})

/**
 * POST /api/openclaw/checkin
 *
 * 移动端设备环境信息签入
 * —— 接收并记录外勤销售移动端设备状态
 * —— 当前版本仅记录日志并返回 sessionId；后续可扩展为设备注册与推送通道绑定
 */
export async function POST(req: NextRequest) {
  try {
    // 频率限制：签到为轻量操作，较 SSE 连接更宽松
    const ip =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";

    if (!rateLimit(ip, CHECKIN_LIMIT, CHECKIN_WINDOW_MS)) {
      return NextResponse.json(
        { status: "error", message: "签到过于频繁，请稍后重试" },
        { status: 429 },
      );
    }

    // 解析并校验请求体
    let body: z.infer<typeof CheckinSchema>
    try {
      const raw = await req.json()
      const parsed = CheckinSchema.safeParse(raw)
      if (!parsed.success) {
        const msg = parsed.error.issues[0]?.message || "请求体格式错误"
        return NextResponse.json(
          { status: "error", message: msg },
          { status: 400 },
        )
      }
      body = parsed.data
    } catch {
      return NextResponse.json(
        { status: "error", message: "请求体格式错误，需要 JSON" },
        { status: 400 },
      );
    }

    // 生成会话 ID（用于后续设备追踪）
    const sessionId = crypto.randomUUID();

    // 记录签到信息（后续可存储至数据库/Redis）
    logger.info("[OpenClaw Checkin] 移动端签到", {
      ip,
      sessionId,
      timezone: body.timezone,
      localTime: body.localTime,
      deviceType: body.deviceType ?? "unknown",
      viewport: body.viewportWidth
        ? `${body.viewportWidth}x${body.viewportHeight}`
        : "unknown",
      preferStandalone: body.preferStandalone ?? false,
      userAgent: body.userAgent
        ? body.userAgent.substring(0, 200) // 截断长 UA
        : "unknown",
    });

    return NextResponse.json({
      status: "ok",
      sessionId,
    });
  } catch (error) {
    logger.error("[OpenClaw Checkin] 签到处理异常", {
      error: error instanceof Error ? error.message : "未知错误",
    });

    return NextResponse.json(
      { status: "error", message: "签到服务内部错误" },
      { status: 500 },
    );
  }
}
