import React from "react";
import { CheckCircle2, ShieldCheck, Cpu } from "lucide-react";

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
      className="bg-[#050505] text-[#F5F5F5] min-h-screen font-sans flex lg:grid lg:grid-cols-12 overflow-hidden selection:bg-[#6D5EF9]/30"
    >
      {/* 左侧品牌区（1200px 以上显示，对应 Tailwind 的 lg 视口） */}
      <div className="hidden lg:flex lg:col-span-5 relative flex-col justify-between p-12 bg-[#111111] border-r border-[#262626] overflow-y-auto">
        {/* 背景微弱装饰光效 */}
        <div className="absolute inset-0 bg-radial-gradient(circle at 10% 10%, rgba(109, 94, 249, 0.08), transparent 60%) pointer-events-none" />
        
        {/* Top: Logo + Name */}
        <div className="relative flex items-center gap-3 z-10 select-none">
          <div className="flex size-10 items-center justify-center rounded-[12px] bg-gradient-to-br from-[#6D5EF9] to-[#4da3ff] shadow-md shadow-[#6D5EF9]/10">
            <svg
              className="size-5 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          {/* 使用 div 避开全局 globals.css 对 h1-h6 强制降低亮度的影响 */}
          <div className="text-[#F5F5F5] text-xl font-bold tracking-wider">
            HermesClaw
          </div>
        </div>

        {/* Center: Slogan & Value Props */}
        <div className="relative my-auto py-12 z-10">
          <div className="text-[#F5F5F5] text-3xl font-extrabold tracking-tight leading-tight mb-8">
            AI-powered digital workforce OS for SMEs
          </div>
          
          <div className="space-y-6">
            {/* 价值点 1 */}
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#6D5EF9]/10 border border-[#6D5EF9]/20 text-[#6D5EF9]">
                <ShieldCheck className="size-4" />
              </div>
              <div>
                <div className="text-[#F5F5F5] font-semibold text-sm">可治理的工作流</div>
                <div className="text-[#B3B3B3] text-xs mt-1 leading-relaxed">
                  基于 Harness Policy 与 L1-L4 授权，动作安全可控，数据合规留痕。
                </div>
              </div>
            </div>

            {/* 价值点 2 */}
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#6D5EF9]/10 border border-[#6D5EF9]/20 text-[#6D5EF9]">
                <Cpu className="size-4" />
              </div>
              <div>
                <div className="text-[#F5F5F5] font-semibold text-sm">行业级 AI 员工</div>
                <div className="text-[#B3B3B3] text-xs mt-1 leading-relaxed">
                  内置外贸等行业插件包（Industry Pack），即装即用，精准匹配岗位职责。
                </div>
              </div>
            </div>

            {/* 价值点 3 */}
            <div className="flex gap-4 items-start">
              <div className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-[8px] bg-[#6D5EF9]/10 border border-[#6D5EF9]/20 text-[#6D5EF9]">
                <CheckCircle2 className="size-4" />
              </div>
              <div>
                <div className="text-[#F5F5F5] font-semibold text-sm">可回滚的自进化</div>
                <div className="text-[#B3B3B3] text-xs mt-1 leading-relaxed">
                  策略提案、Canary 灰度灰度发布与系统故障自动回滚，实现业务持续演进。
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom: Footer */}
        <div className="relative text-[#B3B3B3] text-xs z-10 select-none">
          &copy; {new Date().getFullYear()} HermesClaw Team. All rights reserved.
        </div>
      </div>

      {/* 右侧表单区 */}
      <div className="flex-1 lg:col-span-7 flex flex-col justify-center items-center p-6 lg:p-12 bg-[#050505] overflow-y-auto relative">
        {/* 背景微弱装饰 */}
        <div className="absolute inset-0 bg-radial-gradient(circle at 90% 90%, rgba(109, 94, 249, 0.05), transparent 50%) pointer-events-none" />
        
        {/* 表单容器 (固定宽 360px 居中) */}
        <div className="w-full max-w-[360px] relative z-10 py-8">
          {children}
        </div>
      </div>
    </div>
  );
}
