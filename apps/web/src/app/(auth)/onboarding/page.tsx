"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Loader2, Ship, Globe } from "lucide-react";
import { cn } from "@/lib/utils";

const onboardingSchema = z.object({
  name: z.string().min(1, "您的姓名/昵称不能为空").max(50, "姓名过长"),
  workspaceName: z.string().min(1, "工作空间名称不能为空").max(100, "工作空间名称过长"),
  industry: z.enum(["foreign-trade", "general"]),
});

type OnboardingFormValues = z.infer<typeof onboardingSchema>;

export default function OnboardingPage() {
  const router = useRouter();
  const [submitError, setSubmitError] = useState("");
  const [isWritedWorkspace, setIsWritedWorkspace] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<OnboardingFormValues>({
    resolver: zodResolver(onboardingSchema),
    defaultValues: {
      name: "",
      workspaceName: "",
      industry: "foreign-trade",
    },
  });

  const userName = watch("name");
  const selectedIndustry = watch("industry");

  // 联动逻辑：在用户没有手动修改工作区名称时，自动将工作区设置为 “[姓名] 的工作空间”
  useEffect(() => {
    if (!isWritedWorkspace) {
      if (userName) {
        setValue("workspaceName", `${userName} 的工作空间`);
      } else {
        setValue("workspaceName", "");
      }
    }
  }, [userName, isWritedWorkspace, setValue]);

  const onSubmit = async (data: OnboardingFormValues) => {
    setSubmitError("");
    try {
      const res = await fetch("/api/auth/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || "引导初始化失败");
      }

      // 成功后，重定向跳转到主工作空间聊天页
      router.push("/workspace/chat");
      router.refresh();
    } catch (err: any) {
      setSubmitError(err.message || "初始化失败，请稍后重试");
    }
  };

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="text-center lg:text-left select-none">
        <div className="text-[#F5F5F5] text-2xl font-bold tracking-tight">
          个性化您的体验
        </div>
        <div className="text-[#B3B3B3] text-xs mt-1">
          最后一步！填写基本信息以完成初始化
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
        {/* 姓名 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[#F5F5F5] text-xs font-semibold select-none">
            您的真实姓名 / 昵称
          </label>
          <input
            type="text"
            placeholder="例如：张经理"
            {...register("name")}
            className="w-full h-10 px-3 text-sm bg-transparent border border-[#262626] rounded-[12px] text-[#F5F5F5] placeholder:text-[#B3B3B3]/40 outline-none transition-all focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
          />
          {errors.name && (
            <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">
              {errors.name.message}
            </span>
          )}
        </div>

        {/* 业务场景选择 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[#F5F5F5] text-xs font-semibold select-none">
            主营业务场景（预装数字员工）
          </label>
          <div className="grid grid-cols-2 gap-3 mt-1 select-none">
            {/* 卡片1：外贸行业 */}
            <div
              onClick={() => setValue("industry", "foreign-trade")}
              className={cn(
                "border rounded-[12px] p-3 cursor-pointer text-center flex flex-col items-center justify-center gap-1.5 transition-all",
                selectedIndustry === "foreign-trade"
                  ? "border-[#6D5EF9] bg-[#6D5EF9]/10 text-white"
                  : "border-[#262626] bg-[#111111]/30 text-[#B3B3B3] hover:border-[#333333] hover:bg-[#111111]/50"
              )}
            >
              <Ship className={cn("size-5", selectedIndustry === "foreign-trade" ? "text-[#6D5EF9]" : "text-[#B3B3B3]")} />
              <div>
                <span className="text-xs font-bold block">跨境贸易 / 外贸</span>
                <span className="text-[9px] opacity-60 block mt-0.5 leading-normal">
                  预装销售与单证数字员工
                </span>
              </div>
            </div>

            {/* 卡片2：通用办公 */}
            <div
              onClick={() => setValue("industry", "general")}
              className={cn(
                "border rounded-[12px] p-3 cursor-pointer text-center flex flex-col items-center justify-center gap-1.5 transition-all",
                selectedIndustry === "general"
                  ? "border-[#6D5EF9] bg-[#6D5EF9]/10 text-white"
                  : "border-[#262626] bg-[#111111]/30 text-[#B3B3B3] hover:border-[#333333] hover:bg-[#111111]/50"
              )}
            >
              <Globe className={cn("size-5", selectedIndustry === "general" ? "text-[#6D5EF9]" : "text-[#B3B3B3]")} />
              <div>
                <span className="text-xs font-bold block">通用办公 / 效能</span>
                <span className="text-[9px] opacity-60 block mt-0.5 leading-normal">
                  预装行政与智能文档助手
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 工作空间名称 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-[#F5F5F5] text-xs font-semibold select-none">
            首个工作空间名称
          </label>
          <input
            type="text"
            placeholder="例如：我的外贸工作室"
            {...register("workspaceName", {
              onChange: () => setIsWritedWorkspace(true),
            })}
            className="w-full h-10 px-3 text-sm bg-transparent border border-[#262626] rounded-[12px] text-[#F5F5F5] placeholder:text-[#B3B3B3]/40 outline-none transition-all focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
          />
          {errors.workspaceName && (
            <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">
              {errors.workspaceName.message}
            </span>
          )}
          <span className="text-[#B3B3B3]/40 text-[10px] select-none leading-normal">
            工作空间是团队与智能体协作的数据边界，稍后可随时修改
          </span>
        </div>

        {/* 提交按钮 */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full h-11 mt-2 bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 disabled:bg-[#6D5EF9]/50 text-white rounded-[12px] flex items-center justify-center font-semibold text-sm transition-all select-none cursor-pointer"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="mr-2 size-4 animate-spin" />
              正在为您初始化工作区与数字员工...
            </>
          ) : (
            "开启您的 AI 数字化办公"
          )}
        </button>
      </form>
    </div>
  );
}
