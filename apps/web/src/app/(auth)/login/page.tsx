"use client";

import { useState, useEffect } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";

// PERF: Turnstile 懒加载 (12MB main-app.js 的显著贡献者)
// Cloudflare Turnstile 脚本在浏览器端加载，SSR 时不需要
const Turnstile = dynamic(
  () => import("@marsidev/react-turnstile").then((mod) => mod.Turnstile),
  { ssr: false, loading: () => <div className="h-[65px] bg-[#1F1F1F] border border-[#262626] rounded-[12px] animate-pulse" /> }
);

const loginSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
  password: z.string().min(1, "密码不能为空"),
  rememberMe: z.boolean().optional(),
  turnstileToken: z.string().optional(),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "",
      password: "",
      rememberMe: false,
      turnstileToken: "",
    },
  });

  const onSubmit = async (data: LoginFormValues) => {
    setSubmitError("");
    try {
      let token = data.turnstileToken;
      if (!token) {
        // 无 Turnstile siteKey = 未配置 = 自动跳过
        // 或 NEXT_PUBLIC_DISABLE_TURNSTILE=true = 显式禁用
        if (!siteKey || process.env.NEXT_PUBLIC_DISABLE_TURNSTILE === "true") {
          token = "dev-skip";
        } else {
          setSubmitError("请完成人机验证挑战");
          return;
        }
      }

      // 1. 调用本地登录 API 路由（执行 Turnstile 校验与密码比对）
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          turnstileToken: token,
        }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "登录校验失败");
      }

      // 2. 校验成功，在 next-auth 中登录并写入 session cookie
      const signInRes = await signIn("credentials", {
        email: data.email,
        password: data.password,
        redirect: false,
      });

      if (signInRes?.error) {
        throw new Error("同步登录会话失败，请重试");
      }

      // 3. 跳转至控制台
      router.push("/new");
      router.refresh();
    } catch (err: any) {
      setSubmitError(err.message || "登录失败，请稍后重试");
    }
  };

  const handleGoogleLogin = () => {
    signIn("google", { callbackUrl: "/new" });
  };

  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "";

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="text-center lg:text-left select-none">
        <div className="text-[#F5F5F5] text-2xl font-bold tracking-tight">
          欢迎回来
        </div>
        <div className="text-[#B3B3B3] text-xs mt-1">
          请选择您的登录方式继续
        </div>
      </div>

      {/* 错误展示 */}
      {submitError && (
        <div className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/20 text-[#ff6b6b] rounded-[12px] p-3 text-xs leading-relaxed">
          {submitError}
        </div>
      )}

      {/* Google OAuth 登录按钮 */}
      <button
        type="button"
        onClick={handleGoogleLogin}
        className="w-full flex items-center justify-center bg-[#1F1F1F] text-white hover:bg-[#2A2A2A] transition-colors border border-[#333333] rounded-[12px] py-2.5 text-sm font-medium cursor-pointer"
      >
        <svg className="mr-2.5 size-4" viewBox="0 0 24 24">
          <path
            fill="currentColor"
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
          />
          <path
            fill="currentColor"
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
          />
          <path
            fill="currentColor"
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
          />
          <path
            fill="currentColor"
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
          />
        </svg>
        使用 Google 登录
      </button>

      {/* 分割线 */}
      <div className="flex items-center gap-2 select-none">
        <div className="flex-1 h-px bg-[#262626]" />
        <span className="text-[#B3B3B3] text-[11px] uppercase tracking-wider">或</span>
        <div className="flex-1 h-px bg-[#262626]" />
      </div>

      {/* 登录表单 */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        {/* 邮箱 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[#F5F5F5] text-xs font-semibold select-none">
            邮箱地址
          </label>
          <input
            type="email"
            placeholder="username@email.com"
            {...register("email")}
            className="w-full h-10 px-3 text-sm bg-transparent border border-[#262626] rounded-[12px] text-[#F5F5F5] placeholder:text-[#B3B3B3]/40 outline-none transition-all focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
          />
          {errors.email && (
            <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">{errors.email.message}</span>
          )}
        </div>

        {/* 密码 */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center select-none">
            <label className="text-[#F5F5F5] text-xs font-semibold">密码</label>
            <Link
              href="/forgot-password"
              className="text-[#6D5EF9] text-xs hover:underline"
            >
              忘记密码？
            </Link>
          </div>
          <div className="relative">
            <input
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              {...register("password")}
              className="w-full h-10 pl-3 pr-10 text-sm bg-transparent border border-[#262626] rounded-[12px] text-[#F5F5F5] placeholder:text-[#B3B3B3]/40 outline-none transition-all focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B3B3B3] hover:text-[#F5F5F5] transition-colors"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {errors.password && (
            <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">{errors.password.message}</span>
          )}
        </div>

        {/* 记住我 */}
        <div className="flex items-center gap-2 select-none py-1">
          <input
            id="rememberMe"
            type="checkbox"
            {...register("rememberMe")}
            className="size-4 rounded-[4px] border-[#262626] bg-transparent text-[#6D5EF9] focus:ring-[#6D5EF9]/20 focus:ring-2 cursor-pointer"
          />
          <label htmlFor="rememberMe" className="text-[#B3B3B3] text-xs cursor-pointer">
            记住我
          </label>
        </div>

        {/* Turnstile 验证框 */}
        {siteKey ? (
          <div className="bg-[#1F1F1F] p-3 border border-[#262626] rounded-[12px] flex flex-col items-center justify-center gap-1.5 min-h-[74px]">
            {mounted && (
              <Turnstile
                siteKey={siteKey}
                options={{ theme: "dark" }}
                onSuccess={(token) => setValue("turnstileToken", token, { shouldValidate: true })}
                onError={() => setValue("turnstileToken", "")}
                onExpire={() => setValue("turnstileToken", "")}
              />
            )}
          </div>
        ) : (
          <div className="text-[10px] text-[#B3B3B3]/40 text-center leading-normal select-none py-2">
            人机验证已禁用（开发模式）
          </div>
        )}

        {/* CTA 按钮 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 disabled:bg-[#6D5EF9]/50 text-white rounded-[12px] flex items-center justify-center font-semibold text-sm transition-all select-none cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在登录...
            </>
          ) : (
            "登 录"
          )}
        </button>
      </form>

      {/* 底部跳转 */}
      <div className="text-center text-xs select-none">
        <span className="text-[#B3B3B3]">还没有账号？</span>
        <Link href="/register" className="text-[#6D5EF9] hover:underline font-semibold ml-1">
          注册
        </Link>
      </div>

      {/* 服务条款 & 隐私政策 */}
      <div className="text-center text-[10px] text-[#B3B3B3]/40 leading-normal pt-2 select-none">
        登录即表示您同意我们的
        <br />
        <Link href="/terms" className="text-[#6D5EF9]/60 hover:text-[#6D5EF9] transition-colors">服务条款</Link>
        与
        <Link href="/privacy" className="text-[#6D5EF9]/60 hover:text-[#6D5EF9] transition-colors ml-1">隐私政策</Link>
      </div>
    </div>
  );
}
