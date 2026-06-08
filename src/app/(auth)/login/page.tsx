"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * 登录页
 * —— 居中卡片布局，深色背景与工作台一致
 */
export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("邮箱或密码错误，请重试");
      } else if (result?.ok) {
        router.push("/new");
        router.refresh();
      }
    } catch {
      setError("登录失败，请稍后重试");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-background flex min-h-screen items-center justify-center px-4">
      {/* 背景装饰 */}
      <div className="from-brand/5 to-brand-blue/5 pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))]" />
      <div className="from-brand/10 pointer-events-none absolute left-1/2 top-0 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops),transparent_70%)]" />

      {/* 登录卡片 */}
      <div className="bg-card border-border relative w-full max-w-md rounded-2xl border p-8 shadow-2xl">
        {/* Logo 区域 */}
        <div className="mb-8 text-center">
          {/* 品牌图标 */}
          <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-blue shadow-lg shadow-brand/20">
            <svg
              className="size-7 text-white"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <h1 className="text-foreground text-xl font-bold tracking-tight">
            HermesClaw
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            企业工作台登录
          </p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 错误提示 */}
          {error && (
            <div className="bg-danger/10 border-danger/20 text-danger rounded-lg border px-4 py-2.5 text-sm">
              {error}
            </div>
          )}

          {/* 邮箱 */}
          <div>
            <label
              htmlFor="email"
              className="text-foreground mb-1.5 block text-sm font-medium"
            >
              邮箱
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@hermesclaw.ai"
              required
              autoComplete="email"
              className="border-input bg-background placeholder:text-hint focus:border-brand focus:ring-brand/20 w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors focus:ring-2"
            />
          </div>

          {/* 密码 */}
          <div>
            <label
              htmlFor="password"
              className="text-foreground mb-1.5 block text-sm font-medium"
            >
              密码
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
                className="border-input bg-background placeholder:text-hint focus:border-brand focus:ring-brand/20 w-full rounded-xl border px-4 py-2.5 pr-10 text-sm outline-none transition-colors focus:ring-2"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-hint hover:text-muted-foreground absolute right-3 top-1/2 -translate-y-1/2 transition-colors"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
          </div>

          {/* 登录按钮 */}
          <button
            type="submit"
            disabled={loading}
            className={cn(
              "bg-brand hover:bg-brand/90 text-primary-foreground w-full rounded-xl py-2.5 text-sm font-semibold transition-all",
              "focus:ring-brand/30 focus:ring-2 focus:ring-offset-2 focus:ring-offset-background",
              "disabled:opacity-60 disabled:cursor-not-allowed",
              "active:scale-[0.98]",
            )}
          >
            {loading ? "登录中…" : "登 录"}
          </button>
        </form>

        {/* 底部提示 */}
        <p className="text-hint mt-6 text-center text-xs">
          首次使用？请联系管理员创建账户
        </p>
      </div>
    </div>
  );
}
