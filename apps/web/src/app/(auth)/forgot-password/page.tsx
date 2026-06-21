"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Mail, ArrowLeft, Loader2, CheckCircle2 } from "lucide-react";
import Link from "next/link";

const forgotPasswordSchema = z.object({
  email: z.string().email("请输入有效的邮箱地址"),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [isSent, setIsSent] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: {
      email: "",
    },
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setSubmitError("");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.email }),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "发送重置链接失败");
      }

      setIsSent(true);
    } catch (err: any) {
      setSubmitError(err.message || "请求失败，请稍后重试");
    }
  };

  // 成功状态卡片
  if (isSent) {
    return (
      <div className="space-y-6 text-center select-none">
        <div className="flex flex-col items-center justify-center p-6 bg-[#171717] border border-[#262626] rounded-[16px] space-y-4 shadow-xl">
          <div className="flex size-14 items-center justify-center rounded-full bg-[#6D5EF9]/10 border border-[#6D5EF9]/20 text-[#6D5EF9] animate-bounce">
            <CheckCircle2 className="size-8" />
          </div>
          <div className="space-y-1">
            <div className="text-[#F5F5F5] text-lg font-bold">邮件已发送，请查收</div>
            <p className="text-[#B3B3B3] text-xs max-w-[280px] leading-relaxed mx-auto">
              重置密码链接已经发送到您的邮箱，请在 24 小时内点击链接完成重置。
            </p>
          </div>
        </div>

        <Link
          href="/login"
          className="w-full h-11 bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white rounded-[12px] flex items-center justify-center font-semibold text-sm transition-all cursor-pointer"
        >
          返回登录
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="text-center lg:text-left select-none">
        <div className="text-[#F5F5F5] text-2xl font-bold tracking-tight">
          忘记密码
        </div>
        <div className="text-[#B3B3B3] text-xs mt-1">
          请输入您的邮箱以获取密码重置链接
        </div>
      </div>

      {/* 错误展示 */}
      {submitError && (
        <div className="bg-[#ff6b6b]/10 border border-[#ff6b6b]/20 text-[#ff6b6b] rounded-[12px] p-3 text-xs leading-relaxed">
          {submitError}
        </div>
      )}

      {/* 表单 */}
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-[#F5F5F5] text-xs font-semibold select-none">
            注册邮箱
          </label>
          <div className="relative">
            <input
              type="email"
              placeholder="username@email.com"
              {...register("email")}
              className="w-full h-10 pl-10 pr-3 text-sm bg-transparent border border-[#262626] rounded-[12px] text-[#F5F5F5] placeholder:text-[#B3B3B3]/40 outline-none transition-all focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
            />
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[#B3B3B3]" />
          </div>
          {errors.email && (
            <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">{errors.email.message}</span>
          )}
        </div>

        {/* CTA 按钮 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 disabled:bg-[#6D5EF9]/50 text-white rounded-[12px] flex items-center justify-center font-semibold text-sm transition-all select-none cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在发送...
            </>
          ) : (
            "发送重置链接"
          )}
        </button>
      </form>

      {/* 底部返回链接 */}
      <div className="flex justify-center select-none pt-2">
        <Link
          href="/login"
          className="flex items-center gap-1.5 text-[#B3B3B3] hover:text-[#6D5EF9] text-xs transition-colors font-medium"
        >
          <ArrowLeft className="size-3.5" />
          返回登录
        </Link>
      </div>
    </div>
  );
}
