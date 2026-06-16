"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * AI 消息 Markdown 渲染实现（react-markdown + remark-gfm）
 * —— 重型依赖，由 markdown-renderer.tsx 以 next/dynamic(ssr:false) 懒加载，
 *    避免 react-markdown 进入引用页面（对话区 / 工作流执行 / 设置）的首屏编译图
 */

/** 提取代码块语言标识 */
function extractLang(className?: string): string {
  if (!className) return "";
  const match = className.match(/language-(\w+)/);
  return match ? match[1] : "";
}

export default function MarkdownRendererImpl({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // ===== 标题 =====
        h1: ({ children }) => (
          <h1 className="text-base font-semibold text-foreground mt-3 mb-1.5 first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="text-[15px] font-semibold text-foreground mt-2.5 mb-1 first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="text-sm font-semibold text-foreground mt-2 mb-1 first:mt-0">
            {children}
          </h3>
        ),
        h4: ({ children }) => (
          <h4 className="text-sm font-medium text-foreground mt-2 mb-0.5 first:mt-0">
            {children}
          </h4>
        ),

        // ===== 段落 =====
        p: ({ children }) => (
          <p className="text-sm leading-relaxed my-1.5 first:mt-0 last:mb-0">
            {children}
          </p>
        ),

        // ===== 行内样式 =====
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-muted-foreground/90">{children}</em>
        ),
        del: ({ children }) => (
          <del className="line-through text-hint">{children}</del>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-brand-blue hover:underline"
          >
            {children}
          </a>
        ),

        // ===== 列表 =====
        ul: ({ children }) => (
          <ul className="list-disc pl-5 my-1.5 space-y-0.5 text-sm">
            {children}
          </ul>
        ),
        ol: ({ children }) => (
          <ol className="list-decimal pl-5 my-1.5 space-y-0.5 text-sm">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="text-foreground/90 leading-relaxed">{children}</li>
        ),

        // ===== 引用块 =====
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-primary/50 pl-3 my-2 text-muted-foreground text-sm italic break-words">
            {children}
          </blockquote>
        ),

        // ===== 分隔线 =====
        hr: () => <hr className="my-3 border-border" />,

        // ===== 代码块（带语言标签栏）=====
        code: ({
          className,
          children,
          ...props
        }: React.ComponentPropsWithoutRef<"code">) => {
          const isInline = !className;
          if (isInline) {
            return (
              <code
                className="bg-accent text-primary/90 text-xs px-1.5 py-0.5 rounded font-mono break-words whitespace-pre-wrap"
                {...props}
              >
                {children}
              </code>
            );
          }
          const lang = extractLang(className);
          return (
            <div className="my-2 rounded-lg border border-border overflow-hidden">
              {/* 顶部栏：语言标签 */}
              <div className="flex items-center justify-between bg-sidebar px-3 py-1.5 border-b border-border">
                <span className="text-[11px] text-hint font-mono">
                  {lang || "code"}
                </span>
              </div>
              {/* 代码内容 */}
              <pre className="bg-background overflow-x-auto">
                <code
                  className="block text-xs leading-relaxed px-3 py-2.5 font-mono text-foreground/85"
                  {...props}
                >
                  {children}
                </code>
              </pre>
            </div>
          );
        },

        // ===== 表格 =====
        table: ({ children }) => (
          <div className="overflow-x-auto my-2 rounded-lg border border-border">
            <table className="min-w-full text-sm">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-sidebar border-b border-border">
            {children}
          </thead>
        ),
        th: ({ children }) => (
          <th className="px-3 py-2 text-left text-xs font-semibold text-foreground whitespace-nowrap">
            {children}
          </th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-muted-foreground border-t border-border/50">
            {children}
          </td>
        ),
        tr: ({ children }) => (
          <tr className="even:bg-background/40">{children}</tr>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
