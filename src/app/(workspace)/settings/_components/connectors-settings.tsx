"use client";

import {
  Mail,
  MessageSquare,
  Database,
  LayoutGrid,
  FileSpreadsheet,
  ShoppingCart,
  Globe,
  RefreshCw,
} from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import type { Connector } from "@/types";

// 对应分类的 Lucide 图标
const CATEGORY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  im: MessageSquare,
  crm: Database,
  erp: LayoutGrid,
  sheets: FileSpreadsheet,
  office: FileSpreadsheet,
  custom: Globe,
  alibaba: ShoppingCart,
};

// 格式化 lastSync
function formatLastSync(iso: string | null | undefined): string {
  if (!iso) return "从未同步";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return "刚刚";
  if (diffMins < 60) return `${diffMins}分钟前`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}小时前`;
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

export function ConnectorsSettings() {
  const {
    data: connectors = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["connectors"],
    queryFn: async () => {
      const res = await apiClient.getConnectors();
      return (res.connectors || []) as Connector[];
    },
    staleTime: 10_000,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      return apiClient.updateConnector(id, { status });
    },
    onSuccess: (_, variables) => {
      refetch();
      toast.success(
        variables.status === "connected" ? "连接器已启用" : "已断开连接"
      );
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "连接操作失败");
    },
  });

  const toggleConnection = (id: string, currentlyConnected: boolean) => {
    const nextStatus = currentlyConnected ? "disconnected" : "connected";
    updateMutation.mutate({ id, status: nextStatus });
  };

  const handleSync = async (id: string) => {
    try {
      // 触发同步（也是 PATCH connected 状态来刷新 lastSync）
      await apiClient.updateConnector(id, { status: "connected" });
      refetch();
      toast.success("同步成功");
    } catch {
      toast.error("同步失败");
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl pb-10">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-foreground">连接器授权</h2>
          <p className="text-sm text-muted-foreground mt-1">
            正在加载连接器配置…
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(6)].map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[140px] animate-pulse"
            >
              <div className="flex gap-3">
                <Skeleton className="size-10 rounded-xl" />
                <div className="space-y-2 flex-1">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-3 w-48" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl pb-10 text-center py-20">
        <p className="text-sm text-danger">加载连接器配置失败</p>
        <button
          onClick={() => refetch()}
          className="mt-4 bg-primary text-white rounded-xl px-4 py-2 text-xs font-medium"
        >
          重试
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-4xl pb-10">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-foreground">连接器授权</h2>
        <p className="text-sm text-muted-foreground mt-1">
          管理第三方平台与工具的授权连接，赋予系统更多能力
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {connectors.map((c) => {
          const isConnected = c.status === "connected";
          const Icon = CATEGORY_ICONS[c.category] || CATEGORY_ICONS[c.id] || Globe;
          const isPending = updateMutation.isPending && updateMutation.variables?.id === c.id;

          return (
            <div
              key={c.id}
              className="bg-card rounded-2xl border border-border p-5 flex flex-col justify-between min-h-[140px]"
            >
              <div className="flex items-start justify-between">
                <div className="flex gap-3">
                  <div className="shrink-0 bg-accent size-10 rounded-xl flex items-center justify-center relative">
                    <Icon className="size-[18px] text-foreground" />
                    {c.iconEmoji && (
                      <span className="absolute -bottom-1 -right-1 text-xs select-none">
                        {c.iconEmoji}
                      </span>
                    )}
                  </div>
                  <div>
                    <h3 className="text-foreground font-medium text-sm">
                      {c.name}
                    </h3>
                    <p className="text-muted-foreground text-xs mt-1 leading-relaxed line-clamp-2 pr-2">
                      {c.description}
                    </p>
                  </div>
                </div>
                <div className="shrink-0 ml-2 flex flex-col items-end gap-2">
                  {isConnected ? (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="size-2 rounded-full bg-success"></span>
                        <span className="text-success text-xs font-medium">
                          已连接
                        </span>
                      </div>
                      <button
                        type="button"
                        disabled={isPending}
                        onClick={() => toggleConnection(c.id, true)}
                        className="text-xs text-muted-foreground hover:bg-accent hover:text-foreground px-2 py-1 rounded-lg transition-colors disabled:opacity-50"
                      >
                        断开
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isPending}
                      onClick={() => toggleConnection(c.id, false)}
                      className="bg-primary text-white rounded-xl px-3 py-1.5 text-xs font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isPending ? "连接中…" : "连接"}
                    </button>
                  )}
                </div>
              </div>

              {isConnected && (
                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  <span className="text-hint text-xs">
                    最后同步时间：{formatLastSync(c.lastSync)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleSync(c.id)}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <RefreshCw className="size-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
