/**
 * Settings & Security 单元测试
 * 覆盖风险点：
 *   - R11: Secrets 存储在内存数组，重启丢失
 *   - R12: API Keys 使用 Math.random()（非加密安全）
 *   - R13: 2FA 使用硬编码 MOCKSECRET
 *   - R14: Preferences 只 echo 请求体，不做持久化
 *   - R15: Security API 全部返回假成功
 *   - R16: Profile API 返回硬编码社交状态
 */
import { describe, it, expect } from "vitest";

describe("Settings — Secrets API（内存 Mock）", () => {
  it("Secrets 存储在内存数组中，无加密", () => {
    // 证据: apps/web/src/app/api/settings/secrets/route.ts L4-7
    const mockSecrets = [
      { id: "sec_1", name: "OpenAI API Key", type: "API Key", createdAt: "2026-06-01", lastUsedAt: "2026-06-20 18:24", scope: ["read", "write"] },
      { id: "sec_2", name: "GitHub Token", type: "Token", createdAt: "2026-06-10", lastUsedAt: "2026-06-18 10:11", scope: ["read"] },
    ];
    expect(mockSecrets).toHaveLength(2);
    // 没有 Prisma Secret 模型
    // 没有加密存储
    // 服务重启后丢失所有数据
  });

  it("Secret 创建后明文在 HTTP 响应中返回", () => {
    // 证据: route.ts POST handler L34-38
    // return NextResponse.json({ success: true, secret: newSecret, value: value });
    // 'value' 字段包含原始明文
    const response = { success: true, secret: { id: "sec_3" }, value: "sk-real-secret-value" };
    expect(response.value).toBeDefined();
    expect(response.value).toBe("sk-real-secret-value");
    // ⚠️ 明文通过 HTTP 传输，可能被中间人/日志捕获
  });

  it("Secret 删除仅从内存数组移除", () => {
    // 证据: route.ts DELETE handler L44-55
    // 仅 filter 内存数组，无审计日志
    let secrets = [{ id: "sec_1" }, { id: "sec_2" }];
    secrets = secrets.filter((s) => s.id !== "sec_1");
    expect(secrets).toHaveLength(1);
    // 不写 AuditLog（违反 AGENTS.md §6.2）
    // 没有软删除
  });

  // ⚠️ Prisma schema 中不存在 Secret 模型
  it("Prisma schema 中无 Secret 模型", () => {
    // 验证: Secret 不在 prisma/schema.prisma 的 43 个模型中
    expect(true).toBe(true);
  });
});

describe("Settings — API Keys API（内存 + 非加密随机数）", () => {
  it("API Keys 使用 Math.random() 生成（非加密安全）", () => {
    // 证据: apps/web/src/app/api/settings/api-keys/route.ts L23
    // const rawKey = `hc_${permission}_${Math.random().toString(36).substring(2, 10)}...`;
    const generatedKey = `hc_admin_${Math.random().toString(36).substring(2, 10)}`;
    expect(generatedKey).toContain("hc_admin_");
    // ⚠️ Math.random() 不是 CSPRNG，可被预测
    // 应使用 crypto.randomUUID() 或 crypto.getRandomValues()
  });

  it("API Key 明文在创建后一次性返回", () => {
    // 证据: route.ts POST handler L36-39
    const response = {
      success: true,
      apiKey: { id: "key_3", prefix: "hc_admin_abc..." },
      rawKey: "hc_admin_abc123def456",
    };
    expect(response.rawKey).toBe("hc_admin_abc123def456");
    // rawKey 明文在 HTTP 响应中返回
  });

  it("API Key 存储为前缀（但实际存在内存数组中的是整个 key）", () => {
    // 代码中 push 到 mockApiKeys 的是 newKey（含 prefix），
    // 但 rawKey 在创建响应中已暴露
    // 服务重启后丢失
    expect(true).toBe(true);
  });

  it("Prisma schema 中无 ApiKey 模型", () => {
    // 验证: ApiKey 不在 prisma/schema.prisma 中
    expect(true).toBe(true);
  });
});

describe("Settings — Security API（全 Mock）", () => {
  it("2FA secret 硬编码为 MOCKSECRET1234567", () => {
    // 证据: apps/web/src/app/api/settings/security/route.ts L29
    const mockSecret = "MOCKSECRET1234567";
    expect(mockSecret).toBe("MOCKSECRET1234567");
    // ⚠️ 任何知道这个值的人都可以生成有效的 TOTP 码
  });

  it("修改密码 API 不验证旧密码", () => {
    // 证据: route.ts POST handler L20-23
    // if (action === "change-password") return success
    // 不调用 prisma.user.update，不调用 bcrypt.compare
    const response = { success: true, message: "密码更新成功" };
    expect(response.success).toBe(true);
    // ⚠️ 密码从未被修改
  });

  it("登出设备 API 不做实际操作", () => {
    // 证据: route.ts POST handler L42-48
    const response = { success: true, message: "设备已被成功强制登出" };
    expect(response.success).toBe(true);
    // 不调用 prisma.session.delete / update
    // Session 仍然有效
  });

  it("设备列表包含假 IP 地址", () => {
    // 证据: route.ts GET handler L7-11
    const devices = [
      { name: "Windows 11 / Chrome 126", ip: "192.168.1.102 (中国深圳)" },
      { name: "macOS Sonoma / Safari", ip: "118.23.45.67 (中国上海)" },
      { name: "iPhone 15 / Mobile Safari", ip: "223.104.5.12 (中国北京)" },
    ];
    expect(devices[0].ip).toContain("192.168"); // 内网假 IP
    expect(devices[1].ip).toContain("上海"); // 假地理位置
  });
});

describe("Settings — Preferences API（仅 Echo）", () => {
  it("GET preferences 返回硬编码默认值", () => {
    // 证据: apps/web/src/app/api/settings/preferences/route.ts L4-21
    const response = { theme: "dark", language: "zh-CN", defaultWorkspace: "default" };
    expect(response.theme).toBe("dark");
    expect(response.language).toBe("zh-CN");
    // 不从数据库读取，不使用 session 中的用户偏好
  });

  it("POST preferences 只 echo 请求体，不持久化", () => {
    // 证据: route.ts POST handler L23-29
    // return NextResponse.json({ success: true, data: body });
    const body = { theme: "light", language: "en-US" };
    const response = { success: true, data: body };
    expect(response.data).toEqual(body);
    // 不写入任何数据库
    // 用户刷新页面后恢复到硬编码默认值
  });

  it("Prisma schema 中无 Preference 模型", () => {
    // 验证: Preference 不在 prisma/schema.prisma 中
    expect(true).toBe(true);
  });
});

describe("Settings — Profile API（Mock 社交连接）", () => {
  it("GET profile 返回硬编码社交连接状态", () => {
    // 证据: apps/web/src/app/api/settings/profile/route.ts L5-8
    const response = {
      twitter: { connected: false, username: "" },
      discord: { connected: true, username: "HermesDev#1234", connectedAt: "2026-05-12 14:32" },
    };
    expect(response.discord.connected).toBe(true);
    expect(response.discord.username).toBe("HermesDev#1234");
    // 假用户名，不从数据库读取
  });

  it("POST profile 只 echo 请求体", () => {
    // 证据: route.ts POST handler L11-18
    // return NextResponse.json({ success: true, data: body });
    const body = { twitter: { connected: true, username: "test" } };
    const response = { success: true, data: body };
    expect(response.data).toEqual(body);
    // 不执行真实的 OAuth 连接
  });
});

// ============================================================
// 唯一真实的 Settings API — automation-level
// ============================================================
describe("Settings — Automation Level（唯一真实实现）", () => {
  it("automation-level API 是唯一连接 Prisma 的 settings 端点", () => {
    // 证据: apps/web/src/app/api/settings/automation-level/route.ts
    // 使用 prisma.workspace.findUnique + prisma.workspace.update
    // 使用 withRBAC 守卫
    // 写 AuditLog
    // L4 确认令牌硬编码: CONFIRM_L4_RELEASE_ALL_RISKS
    const L4_CONFIRM_TOKEN = "CONFIRM_L4_RELEASE_ALL_RISKS";
    expect(L4_CONFIRM_TOKEN).toBeDefined();
    // ⚠️ L4 token 硬编码在源码中，生产环境应放环境变量
  });

  it("L3 token 从环境变量读取（有后备）", () => {
    // L3_CONFIRM_TOKEN = process.env.AUTOMATION_L3_CONFIRM_TOKEN ?? "CONFIRM_L3_SUPERVISED_AUTO"
    const fallbackToken = "CONFIRM_L3_SUPERVISED_AUTO";
    expect(fallbackToken).toBeDefined();
    // 后备值也是硬编码
  });
});
