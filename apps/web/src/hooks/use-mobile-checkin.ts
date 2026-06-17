"use client";

import { useEffect, useCallback, useRef } from "react";

/** 签到负载 */
interface CheckinPayload {
  timezone: string;
  localTime: string;
  deviceType: string;
  userAgent: string;
  viewportWidth: number;
  viewportHeight: number;
  preferStandalone: boolean;
}

/** 签到响应 */
interface CheckinResponse {
  status: "ok" | "error";
  sessionId?: string;
  message?: string;
}

/**
 * 推断设备类型
 * —— 基于 User-Agent 与屏幕尺寸综合判断
 */
function detectDeviceType(ua: string, width: number): string {
  const lower = ua.toLowerCase();

  if (/ipad/.test(lower) || (/macintosh/.test(lower) && "ontouchend" in document)) {
    return "tablet";
  }
  if (/iphone|ipod/.test(lower)) return "phone-ios";
  if (/android.*mobile/.test(lower)) return "phone-android";
  if (/android/.test(lower)) return "tablet-android";
  if (/windows phone/.test(lower)) return "phone-windows";

  // 回退：按视口宽度判断
  if (width < 480) return "phone";
  if (width < 1024) return "tablet";
  return "desktop";
}

/**
 * 检测是否以 Standalone 模式运行（已添加到主屏幕）
 */
function isStandaloneMode(): boolean {
  if (typeof window === "undefined") return false;

  // iOS Safari PWA standalone
  if ("standalone" in window.navigator) {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    if (nav.standalone) return true;
  }

  // Android Chrome PWA display-mode
  if (window.matchMedia("(display-mode: standalone)").matches) return true;

  return false;
}

/** 签到间隔（毫秒）—— 每 10 分钟上报一次 */
const CHECKIN_INTERVAL_MS = 10 * 60 * 1000;

/**
 * 移动端环境信息上报 Hook
 * —— 页面加载后立即上报一次，之后每 10 分钟周期上报
 * —— 上报内容：时区、本地时间、设备类型、视口尺寸、PWA 运行模式
 *
 * 使用示例：
 *   // 在 (mobile) layout 的 MobileShell 中调用
 *   useMobileCheckin()
 */
export function useMobileCheckin() {
  const mountedRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** 构建签到负载 */
  const buildPayload = useCallback((): CheckinPayload => {
    return {
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      localTime: new Date().toISOString(),
      deviceType: detectDeviceType(
        typeof navigator !== "undefined" ? navigator.userAgent : "",
        typeof window !== "undefined" ? window.innerWidth : 0,
      ),
      userAgent: typeof navigator !== "undefined" ? navigator.userAgent : "",
      viewportWidth: typeof window !== "undefined" ? window.innerWidth : 0,
      viewportHeight: typeof window !== "undefined" ? window.innerHeight : 0,
      preferStandalone: isStandaloneMode(),
    };
  }, []);

  /** 执行签到 */
  const checkin = useCallback(async () => {
    try {
      const payload = buildPayload();

      const response = await fetch("/api/openclaw/checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        // 不阻塞主线程，超时 5 秒
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = (await response.json()) as CheckinResponse;
        if (process.env.NODE_ENV === "development" && data.sessionId) {
          console.debug(
            `[useMobileCheckin] 签到成功 sessionId=${data.sessionId}`,
          );
        }
      }
    } catch (error) {
      // 静默失败：签到不影响核心功能
      if (process.env.NODE_ENV === "development") {
        console.debug("[useMobileCheckin] 签到时网络错误", error);
      }
    }
  }, [buildPayload]);

  useEffect(() => {
    mountedRef.current = true;

    // 页面加载后延迟 2 秒签到（等待页面渲染完成）
    const initialTimer = setTimeout(() => {
      if (mountedRef.current) checkin();
    }, 2000);

    // 周期性签到
    timerRef.current = setInterval(() => {
      if (mountedRef.current) checkin();
    }, CHECKIN_INTERVAL_MS);

    return () => {
      mountedRef.current = false;
      clearTimeout(initialTimer);
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [checkin]);
}
