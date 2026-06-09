"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Clock,
} from "lucide-react";
import { PageTransition } from "@/components/common/PageTransition";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { ProjectChat } from "./_components/project-chat";
import { ProjectContextPanel } from "./_components/project-context-panel";

// ============================================================
// Mock 会话数据类型
// ============================================================

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  sender?: string;
  content: string;
  time: string;
}

interface ChatSession {
  id: string;
  title: string;
  time: string;
  messages: ChatMessage[];
}

const MOCK_CHAT_SESSIONS: ChatSession[] = [
  {
    id: "h-1",
    title: "分析 hermesclaw-v2 项目...",
    time: "10分钟前",
    messages: [
      {
        id: "m-1-1",
        role: "user",
        content: "我要分析 hermesclaw-v2 项目文件夹，尤其是两个说明文档 CLAUDE.md, AGENTS.md 以及 prd.md 三个核心文件。确认一下目前的短期目标是什么？",
        time: "15:40",
      },
      {
        id: "m-1-2",
        role: "assistant",
        sender: "HermesClaw",
        content: "我已检索并分析了空间底座文件。CLAUDE.md 定义了项目技术栈与全局颜色 token；AGENTS.md 为最高规则，新增了 L1-L4 自动化授权分级规范；prd.md 为产品需求文档。当前 Phase 1 核心短期目标为：建立 Web 工作台基础框架，支持外贸行业 MVP，并提供智慧大脑、项目空间以及动态 Harness 升级审批中心。",
        time: "15:42",
      },
    ],
  },
  {
    id: "h-2",
    title: "在这个项目中，Harness 的定义...",
    time: "14小时前",
    messages: [
      {
        id: "m-2-1",
        role: "user",
        content: "在这个项目中，首先需要知道 harness 的定义是什么。首选的外贸行业有什么特点？",
        time: "昨天 18:30",
      },
      {
        id: "m-2-2",
        role: "assistant",
        sender: "HermesClaw",
        content: "在 HermesClaw-v2 中，Harness（驾驭层）是连接模型与真实业务交付物之间的全部工程结构，包括任务边界、上下文供给、受控工具接入、闭环反馈等。外贸首选行业具有业务流程长、涉及多边合规（如 UL 认证、REACH 标准）、汇率关税多变的特点，非常适合数字员工进行智能编排与执行。",
        time: "昨天 18:32",
      },
    ],
  },
  {
    id: "h-3",
    title: "必须由 AI-First 与 Harness 结合...",
    time: "7天前",
    messages: [
      {
        id: "m-3-1",
        role: "user",
        content: "AI-First 架构和 Harness 控制面如何实现结合？",
        time: "6月2日 10:10",
      },
      {
        id: "m-3-2",
        role: "assistant",
        sender: "HermesClaw",
        content: "AI-First 代表 AI Agent 拥有完整执行权，人扮演策略审批者。而 Harness 则是对 Agent 运行边界的约束。通过将决策与动态 Harness 结合，在置信度低或高风险操作时自动暂停并调起人机交互门禁，实现安全而高效 of 自演化工程闭环。",
        time: "6月2日 10:12",
      },
    ],
  },
];

// ============================================================
// 二级详情页主入口
// ============================================================

export default function ProjectDetailPage() {
  // 会话历史与搜索过滤
  const [sessions, setSessions] = useState<ChatSession[]>(MOCK_CHAT_SESSIONS);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSessionId, setActiveSessionId] = useState("h-1");

  // 过滤后的会话列表
  const filteredSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    return sessions.filter((s) =>
      s.title.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [sessions, searchQuery]);

  // 当前活跃会话
  const activeSession = useMemo(() => {
    return sessions.find((s) => s.id === activeSessionId) || sessions[0];
  }, [sessions, activeSessionId]);

  // 开启新会话
  const handleNewSession = () => {
    const newSession: ChatSession = {
      id: `h-${Date.now()}`,
      title: "新开会话...",
      time: "刚刚",
      messages: [],
    };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
  };

  return (
    <PageTransition>
      {/* 顶层容器，设为 h-[calc(100vh-3rem)] overflow-hidden 以全屏自适应展示，消除奇怪的高度截断 */}
      <div className="flex h-[calc(100vh-3rem)] w-full overflow-hidden bg-background">
        
        {/* ======================================================== */}
        {/* 左栏：会话历史列表 (240px)                             */}
        {/* ======================================================== */}
        <aside className="hidden md:flex w-[240px] shrink-0 border-r border-border bg-sidebar flex-col h-full select-none">
          {/* 搜索框 */}
          <div className="p-3 border-b border-border/40 shrink-0">
            <div className="flex items-center gap-2 bg-background border border-border/60 rounded-xl px-2.5 py-1.5 focus-within:border-primary transition-all">
              <Search className="size-3.5 text-hint" />
              <input
                type="text"
                placeholder="搜索历史会话..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent text-foreground text-xs placeholder:text-hint outline-none w-full"
              />
            </div>
          </div>

          {/* 历史列表 */}
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            <p className="text-hint text-[9px] font-semibold uppercase tracking-wider px-2.5 mb-1.5 mt-1">
              历史会话
            </p>
            {filteredSessions.map((session) => (
              <button
                key={session.id}
                onClick={() => setActiveSessionId(session.id)}
                className={cn(
                  "w-full text-left p-2.5 rounded-xl flex flex-col gap-1 transition-all group border border-transparent",
                  session.id === activeSessionId
                    ? "bg-accent text-foreground font-medium border-border/40"
                    : "text-muted-foreground hover:bg-accent/30 hover:text-foreground"
                )}
              >
                <span className="text-xs truncate flex-1 block">
                  {session.title}
                </span>
                <span className="text-[9px] text-hint font-light flex items-center gap-1">
                  <Clock className="size-2.5" />
                  {session.time}
                </span>
              </button>
            ))}
            {filteredSessions.length === 0 && (
              <p className="text-hint text-[10px] text-center py-8">无会话记录</p>
            )}
          </div>

          {/* 新对话按钮 */}
          <div className="p-3 border-t border-border/40 shrink-0">
            <Button
              onClick={handleNewSession}
              variant="outline"
              className="w-full text-xs rounded-xl flex items-center justify-center gap-1.5 h-8.5"
            >
              <Plus className="size-3.5" />
              新建会话
            </Button>
          </div>
        </aside>

        {/* ======================================================== */}
        {/* 中栏：项目聊天对话主区 (flex-1)                         */}
        {/* ======================================================== */}
        <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden bg-background">
          <ProjectChat
            activeSession={activeSession}
            setSessions={setSessions}
          />
        </main>

        {/* ======================================================== */}
        {/* 右栏：项目配置面板 (320px)                              */}
        {/* ======================================================== */}
        <aside className="hidden md:block w-[320px] shrink-0 h-full overflow-y-auto">
          <ProjectContextPanel />
        </aside>

      </div>
    </PageTransition>
  );
}
