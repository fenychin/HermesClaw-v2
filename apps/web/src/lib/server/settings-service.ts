/**
 * 设置服务 (Settings Service)
 * —— 管理 Secrets / API Keys / User Preferences 的持久化
 * —— Phase 2 新增，替换旧内存数组 mock
 */
import { prisma } from "@/lib/prisma";
import crypto from "crypto";
import bcrypt from "bcryptjs";

// ============================================================
// Secrets (加密存储)
// ============================================================

const ENCRYPTION_KEY = () => {
  const key = process.env.SECRETS_ENCRYPTION_KEY;
  if (!key || key.length < 32) {
    throw new Error("SECRETS_ENCRYPTION_KEY must be at least 32 characters");
  }
  return key;
};

const ALGORITHM = "aes-256-gcm";

function encrypt(value: string): string {
  const key = Buffer.from(ENCRYPTION_KEY(), "utf-8").subarray(0, 32);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(value, "utf-8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return `${iv.toString("hex")}.${authTag}.${encrypted}`;
}

function decrypt(encrypted: string): string {
  const key = Buffer.from(ENCRYPTION_KEY(), "utf-8").subarray(0, 32);
  const [ivHex, authTagHex, data] = encrypted.split(".");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(data, "hex", "utf-8");
  decrypted += decipher.final("utf-8");
  return decrypted;
}

export async function listSecrets(userId: string) {
  return prisma.secret.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      type: true,
      scope: true,
      lastUsedAt: true,
      createdAt: true,
      // encryptedValue 永远不会返回！
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSecret(
  userId: string,
  data: { name: string; type: string; value: string; scope?: string[]; workspaceId?: string }
): Promise<{ id: string; name: string; type: string; scope: string[] }> {
  const encryptedValue = encrypt(data.value);

  const secret = await prisma.secret.create({
    data: {
      userId,
      workspaceId: data.workspaceId,
      name: data.name,
      type: data.type,
      encryptedValue,
      scope: JSON.stringify(data.scope || ["read"]),
    },
  });

  return {
    id: secret.id,
    name: secret.name,
    type: secret.type,
    scope: JSON.parse(secret.scope) as string[],
  };
}

export async function deleteSecret(userId: string, secretId: string): Promise<void> {
  // 先验证所有权
  const secret = await prisma.secret.findFirst({
    where: { id: secretId, userId },
  });
  if (!secret) throw new Error("Secret not found or access denied");
  await prisma.secret.delete({ where: { id: secretId } });
}

// ============================================================
// API Keys (一次性明文展示 + bcrypt 哈希存储)
// ============================================================

export async function listApiKeys(userId: string) {
  return prisma.apiKey.findMany({
    where: { userId },
    select: {
      id: true,
      name: true,
      prefix: true,
      permission: true,
      lastUsedAt: true,
      expiresAt: true,
      createdAt: true,
      // hash 永远不会返回！
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createApiKey(
  userId: string,
  data: { name: string; permission: string; expiresAt?: string; workspaceId?: string }
): Promise<{ id: string; name: string; prefix: string; permission: string; rawKey: string }> {
  // 使用 crypto.randomUUID 生成安全密钥
  const rawKey = `hc_${data.permission}_${crypto.randomUUID().replace(/-/g, "")}`;
  const prefix = rawKey.substring(0, 12) + "...";
  const hash = await bcrypt.hash(rawKey, 10);

  const apiKey = await prisma.apiKey.create({
    data: {
      userId,
      workspaceId: data.workspaceId,
      name: data.name,
      prefix,
      hash,
      permission: data.permission,
      expiresAt: data.expiresAt && data.expiresAt !== "永久" ? new Date(data.expiresAt) : null,
    },
  });

  return {
    id: apiKey.id,
    name: apiKey.name,
    prefix: apiKey.prefix,
    permission: apiKey.permission,
    rawKey, // ← 只在这里返回一次明文
  };
}

export async function deleteApiKey(userId: string, keyId: string): Promise<void> {
  const key = await prisma.apiKey.findFirst({
    where: { id: keyId, userId },
  });
  if (!key) throw new Error("API Key not found or access denied");
  await prisma.apiKey.delete({ where: { id: keyId } });
}

// ============================================================
// User Preferences
// ============================================================

const DEFAULT_PREFERENCES = {
  theme: "dark" as const,
  language: "zh-CN" as const,
  defaultWorkspace: "default",
  emailNotifications: {
    taskCompleted: true,
    workflowFailed: true,
    approvalPending: false,
    weeklySummary: true,
  },
  systemNotifications: {
    approvalRequest: true,
    proposalGenerated: false,
    connectorFailure: true,
  },
};

export async function getUserPreferences(userId: string) {
  const pref = await prisma.userPreference.findUnique({
    where: { userId },
  });

  if (!pref) {
    // 第一次访问：创建默认偏好
    await prisma.userPreference.create({
      data: {
        userId,
        theme: DEFAULT_PREFERENCES.theme,
        language: DEFAULT_PREFERENCES.language,
        notificationSettings: JSON.stringify(DEFAULT_PREFERENCES),
      },
    });
    return DEFAULT_PREFERENCES;
  }

  // 合并通知设置
  const savedNotifications = JSON.parse(pref.notificationSettings || "{}");
  return {
    theme: pref.theme,
    language: pref.language,
    defaultWorkspace: pref.defaultWorkspaceId || "default",
    ...savedNotifications,
  };
}

export async function updateUserPreferences(
  userId: string,
  data: {
    theme?: string;
    language?: string;
    defaultWorkspace?: string;
    emailNotifications?: Record<string, boolean>;
    systemNotifications?: Record<string, boolean>;
  }
) {
  const notificationSettings = {
    emailNotifications: data.emailNotifications || {},
    systemNotifications: data.systemNotifications || {},
  };

  await prisma.userPreference.upsert({
    where: { userId },
    create: {
      userId,
      theme: data.theme || DEFAULT_PREFERENCES.theme,
      language: data.language || DEFAULT_PREFERENCES.language,
      defaultWorkspaceId: data.defaultWorkspace,
      notificationSettings: JSON.stringify(notificationSettings),
    },
    update: {
      theme: data.theme || undefined,
      language: data.language || undefined,
      defaultWorkspaceId: data.defaultWorkspace || undefined,
      notificationSettings: JSON.stringify(notificationSettings),
    },
  });
}

export { DEFAULT_PREFERENCES };
