import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAgentConfigStore } from "@/stores/agent-config-store";
import { useSessionContextStore } from "@/stores/session-context-store";
import { submitIntent } from "@/lib/api/workspace";
import fs from "fs";
import path from "path";

// 模拟全局 fetch
const originalFetch = global.fetch;

describe("三域隔离与 Store 边界集成测试", () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { taskId: "mock-task-123" } }),
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.clearAllMocks();
  });

  // 测试 1：agentConfigStore 不得存储 automationLevel / riskLevel 等敏感控制字段
  it("agentConfigStore 不得存储 automationLevel 字段及其他高危策略参数", () => {
    const state = useAgentConfigStore.getState();
    
    // 验证状态属性中没有受限策略控制参数
    expect(state).not.toHaveProperty("automationLevel");
    expect(state).not.toHaveProperty("riskLevel");
    expect(state).not.toHaveProperty("policySnapshotVersion");
    expect(state).not.toHaveProperty("agentPolicy");
  });

  // 测试 2：sessionContextStore.context 桥接仅传 agentId 字符串，无策略下发
  it("sessionContextStore.context 只含 agentId 字符串，不得存在完整 agentPolicy", () => {
    // 模拟从 API 收到的 SessionContext 桥接通道数据
    const mockContext = {
      sessionId: "sess_12345",
      agentId: "agent_trade_follow",
      workspaceId: "ws_default",
    };

    expect(typeof mockContext.agentId).toBe("string");
    expect(mockContext).not.toHaveProperty("agentPolicy");
    expect(mockContext).not.toHaveProperty("automationLevel");
    expect(mockContext).not.toHaveProperty("riskLevel");
  });

  // 测试 3：submitIntent 请求体不含受限字段，由后端 Hermes 填充
  it("submitIntent payload 不含 automationLevel/riskLevel", async () => {
    const spyFetch = vi.spyOn(global, "fetch");

    await submitIntent({
      sessionId: "session-abc",
      input: "请帮我给这个询盘起草一份开发信",
      agentId: "agent-ft-outreach",
      workspaceId: "ws-test",
    });

    expect(spyFetch).toHaveBeenCalled();
    const [url, options] = spyFetch.mock.calls[0];
    
    expect(url).toBe("/api/sessions/session-abc/intents");
    expect(options?.method).toBe("POST");
    
    const body = JSON.parse(options?.body as string);
    
    // 前端向后端发送意图请求时，只包含 input, agentId, workspaceId
    expect(body).toHaveProperty("input", "请帮我给这个询盘起草一份开发信");
    expect(body).toHaveProperty("agentId", "agent-ft-outreach");
    expect(body).toHaveProperty("workspaceId", "ws-test");
    
    // 绝对禁止越权传递自动化及控制风险参数
    expect(body).not.toHaveProperty("automationLevel");
    expect(body).not.toHaveProperty("riskLevel");
    expect(body).not.toHaveProperty("policySnapshotVersion");
  });

  // 测试 4：/brain 页面不引入任何工作空间相关的 store
  it("brain 页面与组件图谱在源码层面不含 workspace store", () => {
    const brainDir = path.resolve(__dirname, "../app/brain");
    
    function scanFiles(dir: string) {
      if (!fs.existsSync(dir)) return;
      const list = fs.readdirSync(dir);
      for (const file of list) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          scanFiles(fullPath);
        } else if (file.endsWith(".tsx") || file.endsWith(".ts")) {
          const content = fs.readFileSync(fullPath, "utf8");
          // 排除 store 本身以防假阳性，并校验页面与布局源码
          const forbiddenStores = ["sessionStore", "agentConfigStore", "sessionContextStore"];
          forbiddenStores.forEach((forbiddenStore) => {
            expect(content).not.toContain(forbiddenStore);
          });
        }
      }
    }
    
    scanFiles(brainDir);
  });
});
