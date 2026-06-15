import type { MetadataRoute } from "next";

/**
 * PWA Web App Manifest
 * —— 支持外勤销售将移动端执行追踪入口添加到设备主屏幕
 * —— 独立于 workspace 主 Web 工作台，提供类原生应用体验
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/manifest
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "hermesclaw-mobile",
    name: "HermesClaw 移动执行追踪",
    short_name: "HermesClaw",
    description:
      "HermesClaw 外勤销售移动端 PWA — 任务执行追踪、Harness 审批、系统通知",
    start_url: "/tasks",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0B0B0C",
    theme_color: "#0B0B0C",
    icons: [
      {
        src: "/icons/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-192x192-maskable.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/icon-512x512-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    screenshots: [
      {
        src: "/screenshots/mobile-tasks.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "任务列表",
      },
      {
        src: "/screenshots/mobile-approvals.png",
        sizes: "390x844",
        type: "image/png",
        form_factor: "narrow",
        label: "Harness 审批",
      },
    ],
    categories: ["business", "productivity"],
    lang: "zh-CN",
    dir: "ltr",
    prefer_related_applications: false,
  };
}
