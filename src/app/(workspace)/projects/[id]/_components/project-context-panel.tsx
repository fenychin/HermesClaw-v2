"use client";

import { useState, useRef } from "react";
import { useParams } from "next/navigation";
import {
  File,
  Plus,
  Trash2,
  Settings,
  Globe,
  Sparkles,
  Zap,
  CheckCircle,
  Pencil,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProjectContextStore } from "@/stores/project-context-store";
import type { ProjectFile, ProjectSkill, ProjectConnection } from "@/types";

interface ProjectContextPanelProps {
  className?: string;
}

/** 格式化文件大小为人类可读的字符串 */
const formatFileSize = (bytes: number) => {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
};

export function ProjectContextPanel({ className }: ProjectContextPanelProps) {
  const params = useParams<{ id?: string }>();
  const projectId = params?.id || "default";

  const store = useProjectContextStore();
  const { instruction, files, skills, connections } = store.getProjectContext(projectId);

  // 控制各组件的输入展开状态
  const [activeInput, setActiveInput] = useState<"file" | "skill" | "connection" | null>(null);

  // 系统指令状态
  const [localInstructions, setLocalInstructions] = useState(instruction.content);
  const instructionsChanged = localInstructions !== instruction.content;
  const textareaRef = useRef<HTMLTextAreaElement>(null);



  // 输入临时数据
  const [tempFileName, setTempFileName] = useState("");
  const [tempSkillName, setTempSkillName] = useState("");
  const [tempSkillDesc, setTempSkillDesc] = useState("");
  const [tempConnTitle, setTempConnTitle] = useState("");
  const [tempConnUrl, setTempConnUrl] = useState("");

  // ---- 保存系统指令 ----
  const handleSaveInstructions = () => {
    store.setInstruction(projectId, localInstructions);
  };

  const focusInstructions = () => {
    textareaRef.current?.focus();
  };

  // ---- 增加/删除文件 ----
  const addFile = () => {
    if (!tempFileName.trim()) return;
    const extension = tempFileName.includes(".") ? tempFileName.split(".").pop() || "txt" : "txt";
    const newFile: ProjectFile = {
      id: `file-${Date.now()}`,
      name: tempFileName.trim(),
      size: Math.floor(Math.random() * 5 * 1024 * 1024) + 1024, // 随机生成 1KB 到 5MB 之间的大小
      type: extension,
      uploadedAt: new Date().toISOString(),
    };
    store.addFile(projectId, newFile);
    setTempFileName("");
    setActiveInput(null);
  };

  const removeFile = (id: string) => {
    store.removeFile(projectId, id);
  };

  // ---- 增加/删除技能 ----
  const addSkill = () => {
    if (!tempSkillName.trim()) return;
    const newSkill: ProjectSkill = {
      id: `skill-${Date.now()}`,
      name: tempSkillName.trim(),
      description: tempSkillDesc.trim() || "自定义绑定的工作技能项目",
    };
    store.addSkill(projectId, newSkill);
    setTempSkillName("");
    setTempSkillDesc("");
    setActiveInput(null);
  };

  const removeSkill = (id: string) => {
    store.removeSkill(projectId, id);
  };

  // ---- 增加/删除连接 ----
  const addConnection = () => {
    if (!tempConnTitle.trim()) return;
    const url = tempConnUrl.trim() || "https://example.com";
    const formattedUrl = url.startsWith("http") ? url : `https://${url}`;
    const newConnection: ProjectConnection = {
      id: `conn-${Date.now()}`,
      title: tempConnTitle.trim(),
      url: formattedUrl,
    };
    store.addConnection(projectId, newConnection);
    setTempConnTitle("");
    setTempConnUrl("");
    setActiveInput(null);
  };

  const removeConnection = (id: string) => {
    store.removeConnection(projectId, id);
  };

  return (
    <div key={projectId} className={cn("flex flex-col h-full bg-sidebar border-l border-border select-none divide-y divide-border overflow-y-auto", className)}>
      {/* 顶部配置标题 */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0 bg-sidebar-accent/30">
        <span className="text-foreground text-xs font-semibold tracking-wider uppercase flex items-center gap-1.5">
          <Settings className="size-3.5 text-primary" />
          项目配置与上下文
        </span>
        <span className="text-hint text-[10px]">Hermes 实时生效</span>
      </div>

      {/* 板块1：指令 */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-foreground text-xs font-medium flex items-center gap-1.5">
            <Sparkles className="size-3.5 text-primary" />
            系统指令
          </h4>
          <button
            onClick={focusInstructions}
            className="text-primary hover:text-primary/80 text-xs flex items-center gap-0.5"
            title="聚焦编辑"
          >
            <Pencil className="size-3" />
            编辑指令
          </button>
        </div>

        <div className="space-y-2">
          <textarea
            ref={textareaRef}
            value={localInstructions}
            onChange={(e) => setLocalInstructions(e.target.value)}
            placeholder="告诉 HermesClaw 在此空间中如何工作..."
            rows={4}
            className="w-full text-[11px] leading-relaxed bg-card border border-border/80 rounded-lg p-2.5 text-foreground outline-none resize-none placeholder:text-hint focus:border-primary transition-all"
          />
          {instructionsChanged && (
            <div className="flex justify-end gap-1.5">
              <Button
                size="xs"
                variant="ghost"
                onClick={() => setLocalInstructions(instruction.content)}
                className="text-xs text-muted-foreground hover:bg-accent"
              >
                取消
              </Button>
              <Button
                size="xs"
                onClick={handleSaveInstructions}
                className="bg-primary hover:bg-primary/95 text-white text-xs px-2.5 rounded-md"
              >
                保存
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* 板块2：文件 */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-foreground text-xs font-medium flex items-center gap-1.5">
            <File className="size-3.5 text-brand-blue" />
            项目文件
          </h4>
          <button
            onClick={() => setActiveInput(activeInput === "file" ? null : "file")}
            className="text-brand-blue hover:text-brand-blue/80 text-xs flex items-center gap-0.5"
          >
            <Plus className="size-3" />
            添加文件
          </button>
        </div>

        {activeInput === "file" && (
          <div className="bg-card border border-border/80 rounded-lg p-2.5 space-y-2">
            <input
              type="text"
              value={tempFileName}
              onChange={(e) => setTempFileName(e.target.value)}
              placeholder="请输入文件名（例如：SOP.md）..."
              className="w-full text-xs bg-transparent border-0 border-b border-border text-foreground pb-1 outline-none placeholder:text-hint"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => setActiveInput(null)}>
                取消
              </Button>
              <Button size="xs" className="bg-brand-blue text-white" onClick={addFile}>
                上传
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
          {files.map((file) => (
            <div
              key={file.id}
              className="bg-card/20 hover:bg-card border border-border/40 rounded-lg px-2.5 py-2 flex items-center justify-between group"
            >
              <div className="flex items-center gap-2 min-w-0">
                <File className="size-3.5 text-hint shrink-0" />
                <span className="text-foreground text-[11px] truncate font-medium max-w-[130px]" title={file.name}>
                  {file.name}
                </span>
                <span className="text-hint text-[9px] shrink-0 font-light">
                  ({formatFileSize(file.size)})
                </span>
              </div>
              <button
                onClick={() => removeFile(file.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-danger text-hint transition-opacity"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {files.length === 0 && (
            <p className="text-hint text-[11px] py-1">暂无文件上下文，智能体将无法使用本地资料。</p>
          )}
        </div>
      </div>

      {/* 板块3：技能 */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-foreground text-xs font-medium flex items-center gap-1.5">
            <Zap className="size-3.5 text-success" />
            绑定技能
          </h4>
          <button
            onClick={() => setActiveInput(activeInput === "skill" ? null : "skill")}
            className="text-success hover:text-success/80 text-xs flex items-center gap-0.5"
          >
            <Plus className="size-3" />
            添加技能
          </button>
        </div>

        {activeInput === "skill" && (
          <div className="bg-card border border-border/80 rounded-lg p-2.5 space-y-2">
            <input
              type="text"
              value={tempSkillName}
              onChange={(e) => setTempSkillName(e.target.value)}
              placeholder="请输入技能名称..."
              className="w-full text-xs bg-transparent border-0 border-b border-border text-foreground pb-1 outline-none placeholder:text-hint"
            />
            <input
              type="text"
              value={tempSkillDesc}
              onChange={(e) => setTempSkillDesc(e.target.value)}
              placeholder="请输入技能描述..."
              className="w-full text-xs bg-transparent border-0 border-b border-border text-foreground pb-1 outline-none placeholder:text-hint"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => setActiveInput(null)}>
                取消
              </Button>
              <Button size="xs" className="bg-success text-white" onClick={addSkill}>
                启用
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
          {skills.map((skill) => (
            <div
              key={skill.id}
              className="bg-card/20 hover:bg-card border border-border/40 rounded-lg p-2 flex items-start justify-between group"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="size-3 text-success shrink-0" />
                  <span className="text-foreground text-[11px] font-medium truncate">
                    {skill.name}
                  </span>
                </div>
                {skill.description && (
                  <p className="text-hint text-[9px] mt-0.5 pl-4 line-clamp-1" title={skill.description}>
                    {skill.description}
                  </p>
                )}
              </div>
              <button
                onClick={() => removeSkill(skill.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-danger text-hint transition-opacity shrink-0 ml-1 mt-0.5"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {skills.length === 0 && (
            <p className="text-hint text-[11px] py-1">未启用技能。智能体将无法调用特定的业务脚本。</p>
          )}
        </div>
      </div>

      {/* 板块4：链接 */}
      <div className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-foreground text-xs font-medium flex items-center gap-1.5">
            <Globe className="size-3.5 text-warning" />
            优先链接
          </h4>
          <button
            onClick={() => setActiveInput(activeInput === "connection" ? null : "connection")}
            className="text-warning hover:text-warning/80 text-xs flex items-center gap-0.5"
          >
            <Plus className="size-3" />
            添加链接
          </button>
        </div>

        {activeInput === "connection" && (
          <div className="bg-card border border-border/80 rounded-lg p-2.5 space-y-2">
            <input
              type="text"
              value={tempConnTitle}
              onChange={(e) => setTempConnTitle(e.target.value)}
              placeholder="链接名称（如：海关官网）..."
              className="w-full text-xs bg-transparent border-0 border-b border-border text-foreground pb-1 outline-none placeholder:text-hint mb-1"
            />
            <input
              type="text"
              value={tempConnUrl}
              onChange={(e) => setTempConnUrl(e.target.value)}
              placeholder="URL 网址（如：https://...）..."
              className="w-full text-xs bg-transparent border-0 border-b border-border text-foreground pb-1 outline-none placeholder:text-hint"
            />
            <div className="flex justify-end gap-1.5">
              <Button size="xs" variant="ghost" onClick={() => setActiveInput(null)}>
                取消
              </Button>
              <Button size="xs" className="bg-warning text-white" onClick={addConnection}>
                链接
              </Button>
            </div>
          </div>
        )}

        <div className="space-y-1.5 max-h-[140px] overflow-y-auto pr-1">
          {connections.map((conn) => (
            <div
              key={conn.id}
              className="bg-card/20 hover:bg-card border border-border/40 rounded-lg p-2 flex items-center justify-between group"
            >
              <div className="min-w-0 flex-1">
                <a
                  href={conn.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-foreground text-[11px] font-medium truncate flex items-center gap-1.5 hover:text-warning transition-colors"
                >
                  <Globe className="size-3 text-hint shrink-0" />
                  <span className="truncate">{conn.title}</span>
                </a>
              </div>
              <button
                onClick={() => removeConnection(conn.id)}
                className="opacity-0 group-hover:opacity-100 hover:text-danger text-hint transition-opacity shrink-0 ml-1"
              >
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
          {connections.length === 0 && (
            <p className="text-hint text-[11px] py-1">暂无外部数据源连接。</p>
          )}
        </div>
      </div>
    </div>
  );
}
