"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function SettingsPage() {
  const router = useRouter();

  useEffect(() => {
    // 自动重定向至个人资料配置子页
    router.replace("/settings/profile");
  }, [router]);

  return (
    <div className="flex h-screen items-center justify-center bg-[#050505] text-[#B3B3B3] gap-2.5 select-none font-sans">
      <Loader2 className="size-5 animate-spin text-[#6D5EF9]" />
      <span className="text-sm">正在载入设置中心...</span>
    </div>
  );
}
