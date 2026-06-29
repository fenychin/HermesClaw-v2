"use client";

import React, { useEffect, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { 
  ShieldAlert, 
  Shield, 
  Search, 
  Plus, 
  Trash2, 
  Copy, 
  Eye, 
  EyeOff, 
  Loader2, 
  Check, 
  ShieldCheck,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";

// 密钥 Zod 表单校验
const secretSchema = z.object({
  name: z.string().min(1, "密钥名称不能为空"),
  type: z.enum(["API Key", "Token", "Password"]),
  value: z.string().min(1, "密钥值不能为空"),
  scope: z.array(z.string()).min(1, "请至少选择一个权限范围"),
});

type SecretFormValues = z.infer<typeof secretSchema>;

interface SecretItem {
  id: string;
  name: string;
  type: string;
  createdAt: string;
  lastUsedAt: string;
  scope: string[];
}

export default function SecretsSettingsPage() {
  const [loading, setLoading] = useState(true);
  const [secrets, setSecrets] = useState<SecretItem[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  // 新建 Modal 状态
  const [createOpen, setCreateOpen] = useState(false);
  const [showSecretValue, setShowSecretValue] = useState(false);
  const [createdSecretValue, setCreatedSecretValue] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // 删除确认 Modal 状态
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [targetSecret, setTargetSecret] = useState<SecretItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    control,
    reset,
    formState: { errors },
  } = useForm<SecretFormValues>({
    resolver: zodResolver(secretSchema),
    defaultValues: {
      name: "",
      type: "API Key",
      value: "",
      scope: ["read"],
    },
  });

  // 1. 获取密钥列表
  useEffect(() => {
    async function fetchSecrets() {
      try {
        const res = await fetch("/api/settings/secrets");
        if (res.ok) {
          const data = await res.json();
          setSecrets(data);
        }
      } catch {
        toast.error("拉取密钥列表失败");
      } finally {
        setLoading(false);
      }
    }
    fetchSecrets();
  }, []);

  // 2. 添加密钥
  const onSubmit = async (data: SecretFormValues) => {
    setSubmitting(true);
    try {
      const res = await fetch("/api/settings/secrets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const result = await res.json();
        setSecrets((prev) => [...prev, result.secret]);
        // 缓存生成的密钥值，进入一次性明文展示视图
        setCreatedSecretValue(data.value);
        toast.success("密钥创建成功");
        reset();
      } else {
        throw new Error();
      }
    } catch {
      toast.error("创建密钥失败，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  // 3. 删除密钥
  const handleDeleteClick = (secret: SecretItem) => {
    setTargetSecret(secret);
    setDeleteOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!targetSecret) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/settings/secrets?id=${targetSecret.id}`, {
        method: "DELETE",
      });
      if (res.ok) {
        setSecrets((prev) => prev.filter((item) => item.id !== targetSecret.id));
        toast.success(`密钥 ${targetSecret.name} 已被彻底删除`);
      } else {
        throw new Error();
      }
    } catch {
      toast.error("删除密钥失败");
    } finally {
      setDeleting(false);
      setDeleteOpen(false);
      setTargetSecret(null);
    }
  };

  // 4. 复制一次性密钥
  const handleCopy = () => {
    if (!createdSecretValue) return;
    navigator.clipboard.writeText(createdSecretValue);
    setCopied(true);
    toast.success("密钥值已成功复制到剪贴板");
    setTimeout(() => setCopied(false), 2000);
  };

  // 过滤列表
  const filteredSecrets = secrets.filter((item) =>
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.type.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="space-y-8 select-none font-sans">
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-28 bg-[#262626]" />
          <Skeleton className="h-4 w-72 bg-[#262626]" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-10 w-full bg-[#111111] rounded-[12px]" />
          <Skeleton className="h-44 w-full bg-[#111111] rounded-[16px]" />
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
            <Shield className="size-6 text-[#6D5EF9]" />
            受保护密钥
          </div>
          <p className="text-[#B3B3B3] text-sm max-w-lg">
            管理智能体使用的 API 密钥与其他凭证。您的密钥和令牌有专属的受保护位置，在需要时供智能体使用——不必在聊天中粘贴。
          </p>
        </div>
        <Button
          onClick={() => {
            setCreatedSecretValue(null); // 重置一次性视图
            setCreateOpen(true);
          }}
          className="h-10 px-4 bg-[#6D5EF9] hover:bg-[#6D5EF9]/90 text-white rounded-[12px] font-semibold text-xs flex items-center gap-1 cursor-pointer"
        >
          <Plus className="size-4" />
          添加密钥
        </Button>
      </div>

      {/* 搜索框 */}
      <div className="relative select-none">
        <Input
          type="text"
          placeholder="搜索密钥或类型..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full h-10 pl-10 pr-4 bg-[#111111] border-[#262626] text-[#F5F5F5] rounded-[12px] placeholder:text-[#B3B3B3]/40 focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
        />
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-[#B3B3B3]/60" />
      </div>

      {/* 列表渲染 */}
      {filteredSecrets.length === 0 ? (
        /* 空态 */
        <div className="bg-[#111111] border border-[#262626] rounded-[16px] p-12 text-center flex flex-col items-center justify-center space-y-4 select-none">
          <div className="flex size-14 items-center justify-center rounded-full bg-[#262626] border border-[#333333] text-[#B3B3B3]">
            <ShieldAlert className="size-6 text-[#B3B3B3]/70" />
          </div>
          <div className="space-y-1">
            <div className="text-[#F5F5F5] text-sm font-semibold">暂无密钥</div>
            <p className="text-[#B3B3B3] text-xs max-w-[280px] leading-relaxed mx-auto">
              目前尚未配置任何外部集成密钥，添加你的第一个密钥以授权 AI 员工接入外部服务。
            </p>
          </div>
          <Button
            onClick={() => {
              setCreatedSecretValue(null);
              setCreateOpen(true);
            }}
            className="h-9 px-4 bg-[#1F1F1F] border border-[#262626] text-[#F5F5F5] hover:bg-[#2A2A2A] rounded-[12px] text-xs font-semibold"
          >
            添加我的第一个密钥
          </Button>
        </div>
      ) : (
        /* 数据表格 */
        <div className="overflow-x-auto border border-[#262626] rounded-[16px] bg-[#111111] select-none shadow-lg">
          <table className="w-full text-left border-collapse text-xs text-[#B3B3B3]">
            <thead>
              <tr className="bg-[#171717] border-b border-[#262626] text-[#F5F5F5] font-semibold">
                <th className="p-3.5">密钥名称</th>
                <th className="p-3.5">类型</th>
                <th className="p-3.5">权限范围</th>
                <th className="p-3.5">创建时间</th>
                <th className="p-3.5">最后使用</th>
                <th className="p-3.5 text-right">操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredSecrets.map((sec) => (
                <tr key={sec.id} className="border-b border-[#262626]/60 hover:bg-[#171717]/40 transition-colors">
                  <td className="p-3.5 font-medium text-[#F5F5F5]">{sec.name}</td>
                  <td className="p-3.5">
                    <span className="inline-flex px-2 py-0.5 rounded-[6px] text-[10px] bg-[#262626] text-[#B3B3B3] border border-[#333333]">
                      {sec.type}
                    </span>
                  </td>
                  <td className="p-3.5">
                    <div className="flex gap-1 flex-wrap">
                      {sec.scope.map((scp) => (
                        <span key={scp} className="text-[9px] px-1 bg-[#6D5EF9]/10 text-[#6D5EF9] border border-[#6D5EF9]/20 rounded font-mono">
                          {scp}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="p-3.5">{sec.createdAt}</td>
                  <td className="p-3.5">{sec.lastUsedAt}</td>
                  <td className="p-3.5 text-right">
                    <Button
                      variant="ghost"
                      className="h-7 rounded-[10px] px-2 text-[10px] text-[#B3B3B3] hover:text-[#EF4444] hover:bg-[#EF4444]/10 cursor-pointer"
                      onClick={() => handleDeleteClick(sec)}
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

      {/* 创建密钥 Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-6 space-y-4">
          <DialogHeader>
            <DialogTitle className="text-[#F5F5F5] text-base font-bold select-none">
              {createdSecretValue ? "密钥已成功创建" : "添加新密钥"}
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed select-none pt-1">
              {createdSecretValue
                ? "请立即复制并安全保存此密钥，关闭此弹层后将无法再次查看该密钥明文。"
                : "将外部集成的密钥提供给智能体。我们对密钥进行了高度加密和受保护存储。"}
            </DialogDescription>
          </DialogHeader>

          {/* 条件视图渲染：一次性显示明文 */}
          {createdSecretValue ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2.5 p-3.5 bg-[#171717] border border-[#262626] rounded-xl relative group">
                <div className="font-mono text-xs text-[#F5F5F5] break-all select-all flex-1 pr-8">
                  {createdSecretValue}
                </div>
                <button
                  onClick={handleCopy}
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
            /* 创建表单 */
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-3.5">
              {/* 密钥名称 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[#B3B3B3] text-xs font-semibold select-none">密钥名称</label>
                <Input
                  type="text"
                  placeholder="如 OpenAI Production Key"
                  {...register("name")}
                  className="bg-transparent border-[#262626] text-[#F5F5F5] focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
                />
                {errors.name && (
                  <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">{errors.name.message}</span>
                )}
              </div>

              {/* 密钥类型 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[#B3B3B3] text-xs font-semibold select-none">密钥类型</label>
                <Controller
                  name="type"
                  control={control}
                  render={({ field }) => (
                    <select
                      value={field.value}
                      onChange={field.onChange}
                      className="w-full h-10 px-3 bg-[#171717] border border-[#262626] rounded-[12px] text-[#F5F5F5] outline-none transition-colors focus:border-[#6D5EF9] text-xs cursor-pointer"
                    >
                      <option value="API Key">API Key</option>
                      <option value="Token">Token</option>
                      <option value="Password">Password</option>
                    </select>
                  )}
                />
              </div>

              {/* 密钥值 */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[#B3B3B3] text-xs font-semibold select-none">密钥值</label>
                <div className="relative">
                  <Input
                    type={showSecretValue ? "text" : "password"}
                    placeholder="请输入密钥或口令"
                    {...register("value")}
                    className="bg-transparent border-[#262626] text-[#F5F5F5] pr-10 focus-visible:border-[#6D5EF9] focus-visible:ring-2 focus-visible:ring-[#6D5EF9]/20"
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecretValue(!showSecretValue)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#B3B3B3] hover:text-[#F5F5F5]"
                  >
                    {showSecretValue ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
                {errors.value && (
                  <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">{errors.value.message}</span>
                )}
              </div>

              {/* 权限范围 (多选 checkbox) */}
              <div className="flex flex-col gap-2">
                <label className="text-[#B3B3B3] text-xs font-semibold select-none">权限范围 (Scopes)</label>
                <Controller
                  name="scope"
                  control={control}
                  render={({ field }) => (
                    <div className="grid grid-cols-2 gap-2 select-none pt-1">
                      {[
                        { id: "read", label: "只读 (read)" },
                        { id: "write", label: "读写 (write)" },
                        { id: "admin", label: "管理 (admin)" },
                        { id: "execute", label: "运行 (execute)" },
                      ].map((scopeItem) => (
                        <div key={scopeItem.id} className="flex items-center gap-2">
                          <Checkbox
                            id={`scope-${scopeItem.id}`}
                            checked={field.value.includes(scopeItem.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                field.onChange([...field.value, scopeItem.id]);
                              } else {
                                field.onChange(field.value.filter((val) => val !== scopeItem.id));
                              }
                            }}
                          />
                          <label
                            htmlFor={`scope-${scopeItem.id}`}
                            className="text-[#B3B3B3] text-xs cursor-pointer hover:text-[#F5F5F5] transition-colors"
                          >
                            {scopeItem.label}
                          </label>
                        </div>
                      ))}
                    </div>
                  )}
                />
                {errors.scope && (
                  <span className="text-[#ff6b6b] text-xs leading-none mt-0.5">{errors.scope.message}</span>
                )}
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
                  保存并展示一次
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* 删除密钥二次确认 Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-[#111111] border border-[#262626] rounded-[16px] max-w-sm p-5">
          <DialogHeader>
            <DialogTitle className="text-[#EF4444] text-base font-bold">
              确认彻底删除该密钥？
            </DialogTitle>
            <DialogDescription className="text-[#B3B3B3] text-xs leading-relaxed pt-1.5">
              您确定要删除密钥 <strong className="text-[#F5F5F5]">{targetSecret?.name}</strong> 吗？删除后，智能体在运行相关工作流节点时将因缺少凭证而无法建立通信，此操作无法恢复。
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
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
