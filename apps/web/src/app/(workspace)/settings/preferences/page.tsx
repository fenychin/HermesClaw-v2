"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

// Zod 字段校验规则
const preferencesSchema = z.object({
  theme: z.enum(["dark", "light", "system"]),
  language: z.enum(["zh-CN", "en-US", "zh-TW"]),
  defaultWorkspace: z.string().min(1, "必须选择一个默认工作区"),
  emailNotifications: z.object({
    taskCompleted: z.boolean(),
    workflowFailed: z.boolean(),
    approvalPending: z.boolean(),
    weeklySummary: z.boolean(),
  }),
  systemNotifications: z.object({
    approvalRequest: z.boolean(),
    proposalGenerated: z.boolean(),
    connectorFailure: z.boolean(),
  }),
});

type PreferencesFormValues = z.infer<typeof preferencesSchema>;

// 自定义精美 Switch 开关组件 (带 transition 动画)
function Switch({ checked, onChange }: { checked: boolean; onChange: (val: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out outline-none ${
        checked ? "bg-[#6D5EF9]" : "bg-[#262626]"
      }`}
    >
      <span
        className={`pointer-events-none inline-block size-4 transform rounded-full bg-white shadow-lg transition duration-200 ease-in-out ${
          checked ? "translate-x-4" : "translate-x-0"
        }`}
      />
    </button>
  );
}

export default function PreferencesSettingsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string }[]>([]);

  const {
    handleSubmit,
    control,
    reset,
    formState: { isDirty },
  } = useForm<PreferencesFormValues>({
    resolver: zodResolver(preferencesSchema),
    defaultValues: {
      theme: "dark",
      language: "zh-CN",
      defaultWorkspace: "default",
      emailNotifications: {
        taskCompleted: true,
        workflowFailed: true,
        approvalPending: false,
        weeklySummary: true,
      },
      systemNotifications: {
        approvalRequest: true,
        proposalGenerated: false,
        connectorFailure: true,
      },
    },
  });

  // 拉取偏好及工作区列表
  useEffect(() => {
    async function initData() {
      try {
        const [prefRes, wsRes] = await Promise.all([
          fetch("/api/settings/preferences"),
          fetch("/api/workspace"),
        ]);

        if (prefRes.ok && wsRes.ok) {
          const prefData = await prefRes.json();
          const wsData = await wsRes.json();
          setWorkspaces(wsData);
          reset(prefData);
        }
      } catch (err) {
        toast.error("拉取数据失败");
      } finally {
        setLoading(false);
      }
    }
    initData();
  }, [reset]);

  const onSubmit = async (data: PreferencesFormValues) => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings/preferences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        toast.success("偏好设置保存成功");
        
        // 模拟多语言更新机制并重载会话
        localStorage.setItem("lang", data.language);
        document.cookie = `lang=${data.language};path=/;max-age=31536000`;
        
        // 调用 Next.js router.refresh 刷新整个页面文字
        router.refresh();
      } else {
        throw new Error();
      }
    } catch {
      toast.error("保存失败，请稍后重试");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-8 select-none font-sans">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28 bg-[#262626]" />
          <Skeleton className="h-4 w-72 bg-[#262626]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-40 w-full bg-[#111111] rounded-[16px]" />
          <Skeleton className="h-44 w-full bg-[#111111] rounded-[16px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* 标题 */}
      <div className="space-y-1.5 border-b border-[#262626] pb-5 select-none">
        <div className="text-[#F5F5F5] text-2xl font-bold">偏好设置</div>
        <p className="text-[#B3B3B3] text-sm">
          定制您的主题外观、默认工作空间及通知触发频率
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 1. 外观偏好 */}
        <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
          <div className="text-[#F5F5F5] text-sm font-semibold select-none">主题外观</div>
          <Controller
            name="theme"
            control={control}
            render={({ field }) => (
              <div className="grid grid-cols-3 gap-3">
                {[
                  { value: "dark", label: "深色模式", desc: "经典极客深色" },
                  { value: "light", label: "浅色模式", desc: "柔和明亮浅色" },
                  { value: "system", label: "跟随系统", desc: "智能自适应" },
                ].map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    onClick={() => field.onChange(item.value)}
                    className={`flex flex-col items-start p-4 rounded-xl border text-left transition-all cursor-pointer ${
                      field.value === item.value
                        ? "bg-[#6D5EF9]/10 border-[#6D5EF9] text-[#F5F5F5]"
                        : "bg-[#171717] border-[#262626] text-[#B3B3B3] hover:border-[#333333]"
                    }`}
                  >
                    <span className="text-sm font-semibold">{item.label}</span>
                    <span className="text-[10px] text-[#B3B3B3]/60 mt-1">{item.desc}</span>
                  </button>
                ))}
              </div>
            )}
          />
        </div>

        {/* 2. 界面语言与默认工作区 */}
        <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-4">
          <div className="text-[#F5F5F5] text-sm font-semibold select-none">界面与运行域</div>
          <div className="grid grid-cols-2 gap-4">
            {/* 界面语言 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[#B3B3B3] text-xs font-medium select-none">界面语言</label>
              <Controller
                name="language"
                control={control}
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={field.onChange}
                    className="w-full h-10 px-3 bg-[#171717] border border-[#262626] rounded-[12px] text-[#F5F5F5] outline-none transition-colors focus:border-[#6D5EF9] cursor-pointer text-sm"
                  >
                    <option value="zh-CN">简体中文 (Simplified Chinese)</option>
                    <option value="en-US">English (US)</option>
                    <option value="zh-TW">繁體中文 (Traditional Chinese)</option>
                  </select>
                )}
              />
            </div>

            {/* 默认工作区 */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[#B3B3B3] text-xs font-medium select-none">默认工作空间</label>
              <Controller
                name="defaultWorkspace"
                control={control}
                render={({ field }) => (
                  <select
                    value={field.value}
                    onChange={field.onChange}
                    className="w-full h-10 px-3 bg-[#171717] border border-[#262626] rounded-[12px] text-[#F5F5F5] outline-none transition-colors focus:border-[#6D5EF9] cursor-pointer text-sm"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.name}
                      </option>
                    ))}
                  </select>
                )}
              />
            </div>
          </div>
        </div>

        {/* 3. 通知偏好 */}
        <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-5 space-y-5">
          <div className="text-[#F5F5F5] text-sm font-semibold select-none border-b border-[#262626]/60 pb-3">通知频次</div>

          {/* 邮件通知 */}
          <div className="space-y-4">
            <div className="text-[#B3B3B3] text-xs font-semibold select-none">邮件推送订阅</div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { name: "emailNotifications.taskCompleted" as const, title: "任务完成通知", desc: "当智能体结束执行向您发送汇总" },
                { name: "emailNotifications.workflowFailed" as const, title: "工作流故障警报", desc: "当节点超时、权限缺失触发中断" },
                { name: "emailNotifications.approvalPending" as const, title: "审批待处理提示", desc: "L3高危动作等待您授权时" },
                { name: "emailNotifications.weeklySummary" as const, title: "每周运营简报", desc: "聚合KPI表现与进化成果" },
              ].map((item) => (
                <div key={item.name} className="flex items-center justify-between p-3 bg-[#171717] border border-[#262626] rounded-xl">
                  <div className="min-w-0 pr-2 select-none">
                    <div className="text-[#F5F5F5] text-xs font-semibold">{item.title}</div>
                    <div className="text-[10px] text-[#B3B3B3]/60 mt-0.5">{item.desc}</div>
                  </div>
                  <Controller
                    name={item.name}
                    control={control}
                    render={({ field }) => (
                      <Switch checked={field.value} onChange={field.onChange} />
                    )}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* 系统内通知 */}
          <div className="space-y-4 pt-2">
            <div className="text-[#B3B3B3] text-xs font-semibold select-none">系统控制台实时通知</div>
            <div className="grid grid-cols-3 gap-3">
              {[
                { name: "systemNotifications.approvalRequest" as const, title: "审批请求", desc: "右侧面板闪烁" },
                { name: "systemNotifications.proposalGenerated" as const, title: "提案生成", desc: "Canary灰度就绪" },
                { name: "systemNotifications.connectorFailure" as const, title: "连接器故障", desc: "需要重新认证" },
              ].map((item) => (
                <div key={item.name} className="flex flex-col justify-between items-start p-3 bg-[#171717] border border-[#262626] rounded-xl h-24">
                  <div className="select-none">
                    <div className="text-[#F5F5F5] text-xs font-semibold">{item.title}</div>
                    <div className="text-[9px] text-[#B3B3B3]/60 mt-0.5 leading-relaxed">{item.desc}</div>
                  </div>
                  <div className="mt-2.5">
                    <Controller
                      name={item.name}
                      control={control}
                      render={({ field }) => (
                        <Switch checked={field.value} onChange={field.onChange} />
                      )}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* 底部保存按钮 */}
        <div className="flex justify-end pt-2 select-none">
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="h-10 px-5 bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 disabled:bg-[#262626] disabled:text-[#B3B3B3]/40 disabled:border-transparent text-white border border-[#262626] rounded-[12px] font-semibold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                正在保存...
              </>
            ) : (
              <>
                <Save className="size-3.5" />
                保存偏好设置
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
