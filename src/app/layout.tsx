import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "./providers";
import { siteConfig } from "@/config/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/** 根布局 Metadata：全站 SEO 与 OpenGraph 配置 */
export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — AI 数字员工工作台`,
    template: `%s | ${siteConfig.name}`,
  },
  description:
    "HermesClaw-v2：面向中小企业外贸行业的 AI 数字员工基础平台。Hermes 规划记忆 + OpenClaw 执行，动态 Harness 自演化架构。",
  keywords: [
    "AI数字员工",
    "外贸AI",
    "智能体",
    "HermesClaw",
    "Harness",
    "外贸工作台",
  ],
  authors: [{ name: "HermesClaw Team" }],
  creator: "HermesClaw",
  robots: {
    // 工作台不需要被搜索引擎收录
    index: false,
    follow: false,
  },
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon-16x16.png",
    apple: "/apple-touch-icon.png",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: process.env.NEXT_PUBLIC_APP_URL,
    siteName: siteConfig.name,
    title: `${siteConfig.name} — AI 数字员工工作台`,
    description: "面向中小企业外贸行业的 AI 数字员工基础平台",
    images: [
      { url: "/og-image.png", width: 1200, height: 630, alt: "HermesClaw" },
    ],
  },
};

/** 根布局 Viewport：移动端视口与主题色 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0B0B0C",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    // 全站强制深色：html 固定挂 dark class（暂不支持浅色切换）
    <html
      lang="zh-CN"
      className={`dark ${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="bg-background text-foreground min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
