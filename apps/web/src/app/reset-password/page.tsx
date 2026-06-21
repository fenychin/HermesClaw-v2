"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import Link from "next/link";

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!token || !email) {
      setError("无效的重置链接，请重新申请密码重置");
    }
  }, [token, email]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (password !== confirmPassword) {
      setError("两次输入的密码不一致");
      return;
    }

    if (password.length < 6) {
      setError("密码长度不能少于 6 位");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, email, password, confirmPassword }),
      });

      const data = await res.json();
      if (!data.success) {
        setError(data.error || "重置失败");
        return;
      }

      setSuccess("密码重置成功！即将跳转到登录页...");
      setTimeout(() => router.push("/login"), 2000);
    } catch {
      setError("请求失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#050505] px-4">
      <div className="w-full max-w-md space-y-6 bg-[#111111] border border-[#262626] rounded-[20px] p-8">
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold text-[#F5F5F5]">重置密码</h1>
          <p className="text-sm text-[#B3B3B3]">请输入新密码</p>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="p-3 rounded-xl bg-green-500/10 border border-green-500/20 text-green-400 text-sm">
            {success}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-[#B3B3B3] mb-1.5">新密码</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-11 px-3.5 bg-[#1F1F1F] border border-[#262626] rounded-[12px] text-[#F5F5F5] text-sm outline-none focus:border-[#6D5EF9]"
                placeholder="至少 6 位"
              />
            </div>
            <div>
              <label className="block text-xs text-[#B3B3B3] mb-1.5">确认新密码</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full h-11 px-3.5 bg-[#1F1F1F] border border-[#262626] rounded-[12px] text-[#F5F5F5] text-sm outline-none focus:border-[#6D5EF9]"
                placeholder="再次输入新密码"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full h-11 bg-[#6D5EF9] text-white rounded-[12px] font-semibold text-sm hover:bg-[#5D4EE9] disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading && <Loader2 className="size-4 animate-spin" />}
              重置密码
            </button>

            <div className="text-center">
              <Link href="/login" className="text-xs text-[#6D5EF9] hover:underline">
                返回登录
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-[#050505]">
        <Loader2 className="size-8 text-[#6D5EF9] animate-spin" />
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  );
}
