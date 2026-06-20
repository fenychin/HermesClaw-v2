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
      {
        // API 路由禁止缓存敏感数据
        source: "/api/(.*)",
        headers: [
          { key: "Cache-Control", value: "no-store, no-cache, must-revalidate" },
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
