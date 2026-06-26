import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CreateSkillModal } from "../CreateSkillModal";

// mock apiClient
vi.mock("@/lib/api-client", () => ({
  apiClient: {
    installSkill: vi.fn(() => Promise.resolve({ skill: { id: "skill-1" } })),
  },
}));

// mock sonner toast
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe("CreateSkillModal 模板生成", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("填写 name 和 description 后可生成 SKILL.md 模板", () => {
    render(<CreateSkillModal open={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const nameInput = screen.getByPlaceholderText("inquiry-sorter");
    const descInput = screen.getByPlaceholderText("描述该技能的用途、输入与输出…");

    fireEvent.change(nameInput, { target: { value: "inquiry-sorter" } });
    fireEvent.change(descInput, { target: { value: "自动分拣外贸询盘" } });

    const generateBtn = screen.getByText("生成 SKILL.md 模板");
    fireEvent.click(generateBtn);

    expect(screen.getByText("SKILL.md 预览")).toBeInTheDocument();
    expect(screen.getByText(/name: inquiry-sorter/)).toBeInTheDocument();
    expect(screen.getByText(/description: 自动分拣外贸询盘/)).toBeInTheDocument();
    expect(screen.getByText(/# inquiry-sorter/)).toBeInTheDocument();
    expect(screen.getByText(/## Input/)).toBeInTheDocument();
    expect(screen.getByText(/## Output/)).toBeInTheDocument();
  });

  it("未填写 name/description 时生成按钮禁用", () => {
    render(<CreateSkillModal open={true} onClose={vi.fn()} onCreated={vi.fn()} />);

    const generateBtn = screen.getByText("生成 SKILL.md 模板");
    expect(generateBtn).toBeDisabled();
  });
});
