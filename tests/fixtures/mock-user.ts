/**
 * 测试夹具：模拟用户数据
 */
export const MOCK_USER = {
  id: "test-user-id-001",
  email: "test@hermesclaw.ai",
  name: "Test User",
  role: "member",
  image: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
};

export const MOCK_ADMIN_USER = {
  id: "test-admin-id-002",
  email: "admin@hermesclaw.ai",
  name: "Admin User",
  role: "admin",
  image: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
};

export const MOCK_OWNER_USER = {
  id: "test-owner-id-003",
  email: "owner@hermesclaw.ai",
  name: "Owner User",
  role: "owner",
  image: null,
  createdAt: new Date("2026-06-01T00:00:00Z"),
};

export const MOCK_GOOGLE_OAUTH_PROFILE = {
  id: "google-account-id-123",
  email: "google.user@gmail.com",
  name: "Google User",
  image: "https://lh3.googleusercontent.com/photo",
};

export const MOCK_WORKSPACE = {
  id: "test-workspace-id-001",
  name: "Default Workspace",
  plan: "free",
  automationLevel: "L2",
  status: "active",
  createdAt: new Date("2026-06-01T00:00:00Z"),
};
