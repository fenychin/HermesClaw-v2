import path from "path";
import type { NextConfig } from "next";
import bundleAnalyzer from "@next/bundle-analyzer";

const withBundleAnalyzer = bundleAnalyzer({
  enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
  // ★ Next.js 15.3+ 默认启用 Instrumentation Hook，无需 experimental.instrumentationHook

  // 显式锁定项目根目录，避免 Next 因上层目录残留的 package-lock.json 误判 workspace root
  turbopack: {
    root: path.join(__dirname, "../.."),
  },

  // ★ 将原生 Node 模块从 webpack 打包中排除（serverExternalPackages 对 webpack 与 Turbopack 均生效）
  //    —— 避免 webpack 误将 better-sqlite3 / bcryptjs 打入客户端 bundle 导致 fs 等模块解析失败
  serverExternalPackages: [
    "@prisma/client",
    "@prisma/adapter-better-sqlite3",
    "better-sqlite3",
    "bcryptjs",
  ],

  // ★ webpack 层显式 external 配置（与 serverExternalPackages 互补，确保 webpack 模式也不会误打包）
  webpack: (config, { isServer }) => {
    if (isServer) {
      // 服务端：将原生模块标记为 external，由 Node.js 原生 require 加载
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        "better-sqlite3",
        "bcryptjs",
      ];
    }
    return config;
  },

  // 安全响应头（生产安全加固）
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-DNS-Prefetch-Control", value: "on" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob:",
              "font-src 'self'",
              "connect-src 'self' https://api.anthropic.com",
              "frame-ancestors 'none'",
            ].join("; "),
          },
        ],
      },

      // ---- 档位一：严格禁止缓存（写操作 / 认证 / 实时流）----
      // 涵盖：认证、对话消息、连接器执行、SSE 流、Harness 提案写操作
      {
        source:
          "/api/(auth|chat|messages|connectors/execute|openclaw|harness/proposals)(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate",
          },
        ],
      },

      // ---- 档位二：短缓存（只读列表，30s 内可复用）----
      // 涵盖：大盘统计、智能体列表、项目列表、询盘、报价、对话列表、贸易情报
      // s-maxage=30：CDN / 共享缓存最多复用 30 秒
      // stale-while-revalidate=60：过期后 60 秒内仍可返回旧值，同时后台静默重取
      // 与 dashboard/page.tsx 的 revalidate=60（ISR 60s）协作：
      //   服务端每分钟最多重新生成一次，客户端 30s 内直接命中缓存，互不冲突
      {
        source:
          "/api/(dashboard|agents|projects|quotations|inquiries|conversations|trade)(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, s-maxage=30, stale-while-revalidate=60",
          },
        ],
      },

      // ---- 档位三：其余 API 保守兜底（禁止缓存）----
      // 负向匹配：排除档位一、档位二已明确处理的前缀，其余全部 no-store
      {
        source:
          "/api/((?!auth|chat|messages|connectors/execute|openclaw|harness/proposals|dashboard|agents|projects|quotations|inquiries|conversations|trade).*)",
        headers: [
          { key: "Cache-Control", value: "no-store" },
        ],
      },
    ];
  },

  // 路由重定向：废弃旧路由→新路由
  async redirects() {
    return [
      {
        source: "/api/proposals/:path*",
        destination: "/api/harness/proposals/:path*",
        permanent: true,
      },
      {
        source: "/api/task",
        destination: "/api/hermes/task",
        permanent: true,
      },
      {
        source: "/api/industry/:path*",
        destination: "/api/industry-packs/:path*",
        permanent: true,
      },
    ];
  },

  // 禁止暴露 X-Powered-By 头
  poweredByHeader: false,
};

export default withBundleAnalyzer(nextConfig);
