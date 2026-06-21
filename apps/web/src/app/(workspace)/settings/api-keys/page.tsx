"use client";

import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { 
  Key, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  Loader2, 
  AlertTriangle,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// API 密钥表单 Zod 校验
const apiKeySchema = z.object({
  name: z.string().min(1, "密钥名称不能为空"),
  permission: z.enum(["read", "write", "admin"]),
  expiresAt: z.string().optional(),
});

type ApiKeyFormValues = z.infer<typeof apiKeySchema>;

interface ApiKeyItem {
  id: string;
  name: string;
  prefix: string;
  permission: "read" | "write" | "admin";
  createdAt: string;
  lastUsedAt: string;
  expiresAt?: string;
}

export default function ApiKeysSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [apiKeys, setApiKeys] = useState<ApiKeyItem[]>([]);

  // 新建 Modal 状态
  const [createOpen, setCreateOpen] = useState(false);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 删除确认 Modal 状态
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [targetKey, setTargetKey] = useState<ApiKeyItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<ApiKeyFormValues>({
    resolver: zodResolver(apiKeySchema),
    defaultValues: {
      name: "",
      permission: "read",
      expiresAt: "",
    },
  });

  // 1. 加载 API 密钥列表
  useEffect(() => {
    async function fetchKeys() {
      try {
        const res = await fetch("/api/settings/api-keys");
        if (res.ok) {
          const data = await res.json();
          setApiKeys(data);
        }
      } catch {
        toast.error("拉取 API 密钥列表失败");
      } finally {
        setLoading(false);
      }
    }
    fetchKeys();
  }, []);

  // 2. 创建 API 密钥
  const onSubmit = async (data: ApiKeyFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const result = await res.json();
        setApiKeys((prev) => [...prev, result.apiKey]);
        // 缓存完整明文
        setCreatedRawKey(result.rawKey);
        toast.success("API 密钥创建成功");
        reset();
      } else {
        throw new Error();
      }
    } catch {
      toast.error("创建 API 密钥失败");
    } finally {
      setSubmitting(false);
    }
  };

  // 3. 删除 API 密钥
  const handleDeleteClick = (keyItem: ApiKeyItem) => {
    setTargetKey(keyItem);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!targetKey) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/api-keys?id=${targetKey.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setApiKeys((prev) => prev.filter((item) => item.id !== targetKey.id));
        toast.success(`API 密钥 ${targetKey.name} 已成功废弃`);
      } else {
        throw new Error();
      }
    } catch {
      toast.error("废弃 API 密钥失败");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
      setTargetKey(null);
    }
  };

  // 4. 复制完整密钥
  const handleCopyRawKey = () => {
    if (!createdRawKey) return;
    navigator.clipboard.writeText(createdRawKey);
    setCopied(true);
    toast.success("API 密钥已复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="space-y-8 select-none font-sans">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28 bg-[#262626]" />
          <Skeleton className="h-4 w-72 bg-[#262626]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-48 w-full bg-[#111111] rounded-[16px]" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 font-sans">
      {/* 标题 */}
      <div className="flex justify-between items-start border-b border-[#262626] pb-5 select-none">
        <div className="space-y-1.5">
          <div className="text-[#F5F5F5] text-2xl font-bold flex items-center gap-2">
            <Key className="size-6 text-[#6D5EF9]" />
            API 密钥
          </div>
          <p className="text-[#B3B3B3] text-sm max-w-lg">
            用于外部服务或自动化管道安全调用 HermesClaw 提供的 API。请不要与他人分享您的 API 密钥，也不要将它写入浏览器端脚本中。
          </p>
        </div>
        <Button
          onClick={() => {
            setCreatedRawKey(null); // 重置一次性展示
            setCreateOpen(true);
          }}
          className="h-10 px-4 bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white rounded-[12px] font-semibold text-xs flex items-center gap-1 cursor-pointer"
        >
          <Plus className="size-4" />
          创建 API 密钥
        </Button>
      </div>

      {/* 密钥表格 */}
      {apiKeys.length === 0 ? (
        <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-12 text-center flex flex-col items-center justify-center space-y-4 select-none">
          <div className="flex size-14 items-center justify-center rounded-full bg-[#262626] border border-[#333333] text-[#B3B3B3]">
            <Key className="size-6 text-[#B3B3B3]/70" />
          </div>
          <div className="space-y-1">
            <div className="text-[#F5F5F5] text-sm font-semibold">暂无 API 密钥</div>
            <p className="text-[#B3B3B3] text-xs max-w-[280px] leading-relaxed mx-auto">
              目前尚未创建任何 API 密钥。建立一个密钥以允许第三方程序或者自动化流调用。
            </p>
          </div>
          <Button
            onClick={() => {
              setCreatedRawKey(null);
              setCreateOpen(true);
            }}
            className="h-9 px-4 bg-[#1F1F1F] border border-[#262626] text-[#F5F5F5] hover:bg-[#2A2A2A] rounded-[12px] text-xs font-semibold"
          >
            创建第一个 API 密钥
          </Button>
        </div>
      ) : (
        <div className="overflow-x-auto border border-[#262626] rounded-[16px] bg-[#111111] select-none shadow-lg">
          <table className="w-full text-left border-collapse text-xs text-[#B3B3B3]">
            <thead>
              <tr className="bg-[#171717] border-b border-[#262626] text-[#F5F5F5] font-semibold">
                <th className="p-3.5">名称</th>
                <th className="p-3.5">前缀/标识</th>
                <th className="p-3.5">权限</th>
                <th className="p-3.5">创建时间</th>
                <th className="p-3.5">最后使用</th>
                <th className="p-3.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {apiKeys.map((keyItem) => (
                <tr key={keyItem.id} className="border-b border-[#262626]/60 hover:bg-[#171717]/40 transition-colors">
                  <td className="p-3.5 font-medium text-[#F5F5F5]">{keyItem.name}</td>
                  <td className="p-3.5 font-mono text-[#B3B3B3]">{keyItem.prefix}</td>
                  <td className="p-3.5">
                    <span className={`inline-flex px-2 py-0.5 rounded-[6px] text-[10px] font-semibold border ${
                      keyItem.permission === "admin"
                        ? "text-amber-500 bg-amber-500/10 border-amber-500/20"
                        : keyItem.permission === "write"
                        ? "text-[#6D5EF9] bg-[#6D5EF9]/10 border-[#6D5EF9]/20"
                        : "text-[#B3B3B3] bg-[#262626] border-[#333333]"
                    }`}>
                      {keyItem.permission === "admin" ? "管理 (admin)" : keyItem.permission === "write" ? "读写 (write)" : "只读 (read)"}
                    </span>
                  </td>
                  <td className="p-3.5">{keyItem.createdAt}</td>
                  <td className="p-3.5">{keyItem.lastUsedAt}</td>
                  <td className="p-3.5 text-right">
                    <Button
                      variant="ghost"
                      className="h-7 rounded-[10px] px-2 text-[10px] text-[#B3B3B3] hover:text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer"
                      onClick={() => handleDeleteClick(keyItem)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ============================================================
          DIALOG 弹窗管理
         ============================================================ */}

      {/* 创建 API 密钥 Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-[#F5F5F5] text-base font-bold select-none">
              {createdRawKey ? "创建成功，请立即复制" : "创建 API 密钥"}
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed select-none pt-1">
              {createdRawKey
                ? "这是您唯一一次能查看完整明文密钥的机会。关闭此窗口后，您将无法再次找回它。"
                : "请为 API 密钥设置名称与调用权限。"}
            </DialogDescription>
          </DialogHeader>

          {/* 一次性明文暴露视图 */}
          {createdRawKey ? (
            <div className="space-y-4">
              <div className="bg-[#EF4444]/10 border border-[#EF4444]/20 text-[#EF4444] text-[11px] rounded-xl p-3 flex gap-2 items-start select-none">
                <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                <span>请立即复制并妥善保存。出于安全考虑，此口令在此之后将永久掩码隐藏！</span>
              </div>
              <div className="flex items-center gap-2.5 p-3.5 bg-[#171717] border border-[#262626] rounded-xl relative">
                <div className="font-mono text-xs text-[#F5F5F5] break-all select-all flex-1 pr-8">
                  {createdRawKey}
                </div>
                <button
                  onClick={handleCopyRawKey}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex size-7 items-center justify-center rounded-lg bg-[#262626] hover:bg-[#333333] border border-[#333333] text-[#B3B3B3] hover:text-[#F5F5F5] transition-colors"
                >
                  {copied ? <Check className="size-3.5 text-[#6D5EF9]" /> : <Copy className="size-3.5" />}
                </button>
              </div>
              <DialogFooter className="select-none">
                <Button
                  className="w-full h-10 rounded-[12px] bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-semibold text-xs"
                  onClick={() => setCreateOpen(false)}
                >
                  我已妥善保存，关闭
                </Button>
              </DialogFooter>
            </div>
          ) : (
            /* 表单填写视图 */
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
              {/* 密钥名称 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[#B3B3B3] text-xs font-semibold select-none">密钥名称</label>
                <Input
                  type="text"
                  placeholder="如 CI/CD Pipeline Key"
                  {...register("name")}
                  className="bg-transparent border-[#262626] text-[#F5F5F5] focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
                />
                {errors.name && (
                  <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">{errors.name.message}</span>
                )}
              </div>

              {/* 权限范围 (单选) */}
              <div className="flex flex-col gap-1.5 select-none">
                <label className="text-[#B3B3B3] text-xs font-semibold">权限范围</label>
                <Controller
                  name="permission"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-3 gap-2 pt-1">
                      {[
                        { id: "read", label: "只读", desc: "read-only" },
                        { id: "write", label: "读写", desc: "read-write" },
                        { id: "admin", label: "管理", desc: "admin" },
                      ].map((perm) => (
                        <button
                          key={perm.id}
                          type="button"
                          onClick={() => field.onChange(perm.id)}
                          className={`flex flex-col items-center justify-center p-2 rounded-xl border text-center transition-all cursor-pointer ${
                            field.value === perm.id
                              ? "bg-[#6D5EF9]/10 border-[#6D5EF9] text-[#F5F5F5]"
                              : "bg-[#171717] border-[#262626] text-[#B3B3B3] hover:border-[#333333]"
                          }`}
                        >
                          <span className="text-xs font-semibold">{perm.label}</span>
                          <span className="text-[9px] text-[#B3B3B3]/55 mt-0.5">{perm.desc}</span>
                        </button>
                      ))}
                    </div>
                  )}
                />
              </div>

              {/* 过期时间 (可选日期选择器) */}
              <div className="flex flex-col gap-1.5 select-none">
                <label className="text-[#B3B3B3] text-xs font-semibold">过期时间 (可选)</label>
                <Input
                  type="date"
                  {...register("expiresAt")}
                  className="bg-transparent border-[#262626] text-[#F5F5F5] focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20 cursor-pointer text-xs"
                />
              </div>

              <DialogFooter className="flex gap-2 justify-end pt-3 select-none">
                <DialogClose
                  render={
                    <Button
                      variant="outline"
                      className="h-10 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                      disabled={submitting}
                    />
                  }
                >
                  取消
                </DialogClose>
                <Button
                  type="submit"
                  className="h-10 rounded-[12px] text-xs bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white font-semibold"
                  disabled={submitting}
                >
                  {submitting && <Loader2 className="size-3 animate-spin mr-1" />}
                  创建并展示一次
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除/废弃 API 密钥二次确认 Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-[#EF4444] text-base font-bold">
              确定要彻底废弃该 API 密钥？
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed pt-1.5">
              您确定要删除并废弃密钥 <strong className="text-[#F5F5F5]">{targetKey?.name}</strong> 吗？废弃后，任何使用此密钥进行外部调用的程序都将立刻收到 401 鉴权拒绝错误，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 flex gap-2 justify-end">
            <DialogClose
              render={
                <Button
                  variant="outline"
                  className="h-9 rounded-[12px] text-xs border-[#262626] bg-transparent text-[#B3B3B3] hover:bg-[#1F1F1F]"
                  disabled={deleting}
                />
              }
            >
              取消
            </DialogClose>
            <Button
              className="h-9 rounded-[12px] text-xs bg-[#EF4444] hover:bg-[#EF4444]/90 text-white flex items-center gap-1"
              onClick={handleConfirmDelete}
              disabled={deleting}
            >
              {deleting && <RefreshCw className="size-3 animate-spin" />}
              彻底废弃
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
