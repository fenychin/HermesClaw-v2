"use client";

import dynamic from "next/dynamic";

/**
 * AI 消息 Markdown 渲染组件（懒加载包装）
 * —— 真正的渲染逻辑在 markdown-renderer-impl.tsx，react-markdown + remark-gfm 体积较大，
 *    这里用 next/dynamic(ssr:false) 将其拆为独立块、按需加载，降低引用页面的首屏编译与 JS 体积。
 *    对外仍导出同名 MarkdownRenderer，调用方无需改动。
 */
const MarkdownRendererImpl = dynamic(
  () => import("./markdown-renderer-impl"),
  {
    ssr: false,
    loading: () => (
      <p className="text-sm leading-relaxed text-muted-foreground/70">
        渲染中…
      </p>
    ),
  },
);

export function MarkdownRenderer({ content }: { content: string }) {
  return <MarkdownRendererImpl content={content} />;
}
