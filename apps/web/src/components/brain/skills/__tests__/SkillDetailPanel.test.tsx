import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SkillDetailPanel } from "../SkillDetailPanel";
import type { Skill } from "@/types";

// mock apiClient
const mockGetAgents = vi.fn();
const mockGetSkillFileContent = vi.fn();

vi.mock("@/lib/api-client", () => ({
  apiClient: {
    getAgents: (...args: any[]) => mockGetAgents(...args),
    getSkillFileContent: (...args: any[]) => mockGetSkillFileContent(...args),
    updateSkill: vi.fn(() => Promise.resolve({})),
    deleteSkill: vi.fn(() => Promise.resolve({})),
    testSkill: vi.fn(() => Promise.resolve({ success: true })),
  },
}));

// mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
}));

// mock markdown renderer
vi.mock("@/components/common/markdown-renderer", () => ({
  MarkdownRenderer: ({ content }: { content: string }) => <div data-testid="markdown">{content}</div>,
}));

// mock components
vi.mock("@/components/common/status-badge", () => ({
  StatusBadge: ({ status }: { status: string }) => <span data-testid="status-badge">{status}</span>,
}));

vi.mock("@/components/common/agent-status-badge", () => ({
  AutomationLevelBadge: ({ level }: { level: string }) => <span data-testid="automation-badge">{level}</span>,
}));

function createSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    name: "test-skill",
    description: "A test skill",
    version: "v1.0.0",
    category: "custom:通用",
    source: "CUSTOM",
    status: "active",
    inputSchema: "{}",
    outputSchema: "{}",
    usedByAgents: [],
    scenarios: [],
    automationLevel: "L2",
    updatedAt: new Date().toISOString(),
    fileTree: [{ path: "SKILL.md", type: "file" }],
    ...overrides,
  };
}

describe("SkillDetailPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAgents.mockResolvedValue({ agents: [] });
    mockGetSkillFileContent.mockResolvedValue({ content: "# SKILL.md content" });
  });

  it("未选中文件时自动加载 SKILL.md", async () => {
    const onSelectFilePath = vi.fn();
    render(
      <SkillDetailPanel
        skill={createSkill()}
        selectedFilePath={null}
        onSelectFilePath={onSelectFilePath}
      />
    );

    await waitFor(() => {
      expect(onSelectFilePath).toHaveBeenCalledWith("SKILL.md");
    });
  });

  it("展示已绑定 Agent 名称标签", async () => {
    mockGetAgents.mockResolvedValue({
      agents: [
        { id: "agent-1", name: "Agent A" },
        { id: "agent-2", name: "Agent B" },
      ],
    });

    render(
      <SkillDetailPanel
        skill={createSkill()}
        selectedFilePath={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("Agent A")).toBeInTheDocument();
      expect(screen.getByText("Agent B")).toBeInTheDocument();
    });
  });

  it("无绑定 Agent 时显示灰色提示", async () => {
    mockGetAgents.mockResolvedValue({ agents: [] });

    render(
      <SkillDetailPanel
        skill={createSkill()}
        selectedFilePath={null}
      />
    );

    await waitFor(() => {
      expect(screen.getByText("暂未绑定至任何智能体")).toBeInTheDocument();
    });
  });
});
