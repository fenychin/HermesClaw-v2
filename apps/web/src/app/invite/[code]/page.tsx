"use client";

import { useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import { Loader2, Gift } from "lucide-react";

export default function InviteLandingPage() {
  const router = useRouter();
  const params = useParams();
  const code = params?.code as string;

  useEffect(() => {
    if (code) {
      localStorage.setItem("inviteCode", code);
    }
    // 自动重定向到注册页面
    const timer = setTimeout(() => {
      router.push("/register");
    }, 1500);

    return () => clearTimeout(timer);
  }, [code, router]);

  return (
    <div className="min-h-screen bg-[#050505] text-[#F5F5F5] flex flex-col items-center justify-center font-sans select-none space-y-6">
      <div className="size-16 rounded-full bg-[#111111] border border-[#262626] flex items-center justify-center text-[#6D5EF9] animate-bounce shadow-lg shadow-[#6D5EF9]/10">
        <Gift className="size-8 animate-pulse" />
      </div>
      <div className="text-center space-y-2">
        <h1 className="text-lg font-bold text-[#F5F5F5]">接受好友的 HermesClaw 邀请</h1>
        <p className="text-xs text-[#B3B3B3] max-w-xs leading-relaxed">
          邀请码已自动激活，正在为您前往注册页面...
        </p>
      </div>
      <div className="flex items-center gap-2 text-xs text-[#B3B3B3]/60 bg-[#111111] border border-[#262626] px-3.5 py-1.5 rounded-full font-mono">
        <Loader2 className="size-3.5 text-[#6D5EF9] animate-spin" />
        <span>激活码: {code}</span>
      </div>
    </div>
  );
}
