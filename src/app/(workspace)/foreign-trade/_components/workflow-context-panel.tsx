"use client";

import { useState, useRef } from "react";
import {
  Settings2,
  Paperclip,
  History,
  Upload,
  X,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ============================================================
// 全局执行参数 Mock 数据
// ============================================================

interface GlobalParam {
  key: string;
  label: string;
  value: string;
}

const GLOBAL_PARAMS: GlobalParam[] = [
  { key: "customer_name", label: "目标客户", value: "Outdoor World LLC" },
  { key: "product_line", label: "产品线", value: "户外折叠椅" },
  { key: "language", label: "输出语言", value: "英文" },
  { key: "market", label: "目标市场", value: "美国" },
];

// ============================================================
// 关联文件 Mock 数据
// ============================================================

interface AttachedFile {
  id: string;
  name: string;
  size: string; // 已格式化的文件大小，如 "2.3 MB"
}

const INIT_FILES: AttachedFile[] = [
  { id: "f-1", name: "产品目录_2025Q2.pdf", size: "4.1 MB" },
  { id: "f-2", name: "客户公司调研.docx", size: "892 KB" },
];

// ============================================================
// 执行历史 Mock 数据
// ============================================================

type ExecStatus = "completed" | "failed" | "running";

interface ExecRecord {
  id: string;
  time: string;
  status: ExecStatus;
  /** 执行耗时（秒） */
  durationSec?: number;
}

const EXEC_HISTORY: ExecRecord[] = [
  { id: "er-1", time: "今天 14:32", status: "completed", durationSec: 47 },
  { id: "er-2", time: "今天 10:18", status: "failed" },
  { id: "er-3", time: "昨天 16:05", status: "completed", durationSec: 52 },
  { id: "er-4", time: "昨天 09:40", status: "completed", durationSec: 38 },
  { id: "er-5", time: "6月6日 11:20", status: "completed", durationSec: 61 },
];

// ============================================================
// 子组件：执行参数卡片
// ============================================================

function ParamsCard() {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      {/* 卡片标题 */}
      <div className="flex items-center gap-2 mb-3">
        <Settings2 className="size-3.5 text-muted-foreground" />
        <p className="text-foreground text-xs font-semibold">执行参数</p>
      </div>

      {/* 参数列表 */}
      <div className="space-y-2.5">
        {GLOBAL_PARAMS.map((param) => (
          <div key={param.key} className="flex items-center justify-between">
            <span className="text-hint text-xs">{param.label}</span>
            <span className="text-foreground text-xs font-medium truncate max-w-[120px]">
              {param.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// 子组件：关联文件卡片
// ============================================================

function FilesCard() {
  const [files, setFiles] = useState<AttachedFile[]>(INIT_FILES);
  const inputRef = useRef<HTMLInputElement>(null);

  /** 处理文件上传（仅做 UI 模拟） */
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files;
    if (!picked) return;
    Array.from(picked).forEach((f) => {
      const sizeKb = f.size / 1024;
      const sizeLabel =
        sizeKb > 1024 ? `${(sizeKb / 1024).toFixed(1)} MB` : `${sizeKb.toFixed(0)} KB`;
      setFiles((prev) => [
        ...prev,
        { id: `f-${Date.now()}`, name: f.name, size: sizeLabel },
      ]);
    });
    // 重置 input，允许重复选同名文件
    e.target.value = "";
  };

  /** 删除已上传文件 */
  const handleRemove = (id: string) => {
    setFiles((prev) => prev.filter((f) => f.id !== id));
  };

  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      {/* 卡片标题 + 上传按钮 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Paperclip className="size-3.5 text-muted-foreground" />
          <p className="text-foreground text-xs font-semibold">关联文件</p>
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex items-center gap-1 text-primary text-xs",
            "hover:text-primary/80 transition-colors",
          )}
        >
          <Upload className="size-3" />
          上传
        </button>
        {/* 隐藏的文件 input */}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {/* 文件列表 */}
      {files.length > 0 ? (
        <div className="space-y-2">
          {files.map((f) => (
            <div
              key={f.id}
              className="flex items-center gap-2 group bg-background rounded-xl px-2.5 py-1.5"
            >
              <Paperclip className="size-3 text-hint shrink-0" />
              <span className="text-foreground text-xs flex-1 truncate">{f.name}</span>
              <span className="text-hint text-[10px] shrink-0">{f.size}</span>
              {/* 删除按钮（hover 时显示） */}
              <button
                type="button"
                onClick={() => handleRemove(f.id)}
                className="text-hint hover:text-danger transition-colors opacity-0 group-hover:opacity-100 shrink-0"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-hint text-xs text-center py-3">暂无关联文件</p>
      )}
    </div>
  );
}

// ============================================================
// 子组件：执行历史卡片
// ============================================================

/** 执行状态图标与颜色映射 */
function ExecStatusIcon({ status }: { status: ExecStatus }) {
  if (status === "completed") {
    return <CheckCircle2 className="size-3.5 text-success shrink-0" />;
  }
  if (status === "failed") {
    return <XCircle className="size-3.5 text-danger shrink-0" />;
  }
  return (
    <div className="size-3.5 rounded-full border-2 border-primary border-t-transparent animate-spin shrink-0" />
  );
}

function HistoryCard() {
  return (
    <div className="bg-card rounded-2xl border border-border p-4">
      {/* 卡片标题 */}
      <div className="flex items-center gap-2 mb-3">
        <History className="size-3.5 text-muted-foreground" />
        <p className="text-foreground text-xs font-semibold">执行历史</p>
        <span className="text-hint text-[10px] ml-auto">最近 5 次</span>
      </div>

      {/* 历史记录列表 */}
      <div className="space-y-2.5">
        {EXEC_HISTORY.map((rec) => (
          <div key={rec.id} className="flex items-center gap-2">
            <ExecStatusIcon status={rec.status} />
            <span className="text-muted-foreground text-xs flex-1">{rec.time}</span>
            {/* 耗时（completed 时显示） */}
            {rec.durationSec !== undefined && (
              <span className="flex items-center gap-0.5 text-hint text-[10px]">
                <Clock className="size-2.5" />
                {rec.durationSec}s
              </span>
            )}
            {rec.status === "failed" && (
              <span className="text-danger text-[10px]">失败</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// WorkflowContextPanel 主组件
// ============================================================

/**
 * 工作流上下文与参数配置面板（右栏）
 * —— 从上到下：执行参数、关联文件、执行历史
 */
export function WorkflowContextPanel() {
  return (
    <aside className="w-64 shrink-0 h-full overflow-y-auto border-l border-border p-4 space-y-4">
      {/* 执行参数卡片 */}
      <ParamsCard />

      {/* 关联文件卡片 */}
      <FilesCard />

      {/* 执行历史卡片 */}
      <HistoryCard />
    </aside>
  );
}
