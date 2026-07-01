import React from "react";

const authThemeStyles = {
  "--background": "#050505",
  "--card": "#171717",
  "--border": "#262626",
  "--foreground": "#F5F5F5",
  "--muted-foreground": "#B3B3B3",
  "--primary": "#6D5EF9",
  "--ring": "#6D5EF9",
  "--input": "#262626",
} as React.CSSProperties;

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      style={authThemeStyles}
      className="bg-[#050505] text-[#F5F5F5] min-h-screen font-sans flex items-center justify-center overflow-hidden selection:bg-[#6D5EF9]/30 relative"
    >
      {/* 背景微弱装饰光效 */}
      <div className="absolute inset-0 bg-radial-gradient(circle at 50% 50%, rgba(109, 94, 249, 0.05), transparent 60%) pointer-events-none" />
      
      {/* 表单容器 (固定宽 360px 居中) */}
      <div className="w-full max-w-[360px] relative z-10 px-6 py-8">
        {children}
      </div>
    </div>
  );
}
