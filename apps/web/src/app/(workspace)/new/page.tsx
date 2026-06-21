"use client";

import dynamic from "next/dynamic";

/** 新对话板块居中布局骨架屏 */
function NewTopicRouteSkeleton() {
  return (
    <div className="flex-1 p-6 max-w-2xl mx-auto flex flex-col justify-center min-h-[500px] animate-pulse space-y-6">
      {/* 居中输入框占位 */}
      <div className="h-28 bg-card/45 border border-border/30 rounded-2xl w-full" />
      {/* 快捷按钮组占位 */}
      <div className="grid grid-cols-2 gap-4">
        <div className="h-20 bg-card/45 border border-border/30 rounded-2xl" />
        <div className="h-20 bg-card/45 border border-border/30 rounded-2xl" />
        <div className="h-20 bg-card/45 border border-border/30 rounded-2xl" />
        <div className="h-20 bg-card/45 border border-border/30 rounded-2xl" />
      </div>
    </div>
  );
}

// 动态按需懒加载新对话（超级入口）核心组件，消除首屏卡顿
const NewTopicPageClient = dynamic(() => import("./page-client"), {
  ssr: false,
  loading: () => <NewTopicRouteSkeleton />,
});

export default function NewTopicPage() {
  return <NewTopicPageClient />;
}
