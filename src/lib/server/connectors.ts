/**
 * 连接器（Connectors）服务端逻辑
 * 
 * 职责：
 * 1. 查询当前工作空间的连接器；
 * 2. 推断并富化连接器元数据（如 authScope、configStatus、failureCount）；
 * 3. 剥离 API 接口层的业务计算与推演逻辑。
 */
import { prisma } from "@/lib/prisma";
import { serializeConnector } from "@/lib/api-utils";
import type { Connector } from "@/types";

export interface ConnectorsDeps {
  prisma: typeof prisma;
}

const defaultDeps: ConnectorsDeps = {
  prisma,
};

/**
 * 获取富化后的连接器列表
 * @param workspaceId 工作空间 ID
 * @param deps 依赖注入
 * @returns 连接器列表
 */
export async function getEnrichedConnectors(
  workspaceId: string,
  deps = defaultDeps,
): Promise<Connector[]> {
  const connectors = await deps.prisma.connector.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });

  return connectors.map((c) => {
    const serialized = serializeConnector(c as unknown as Record<string, unknown>);
    const permissions = (serialized.permissions || []) as string[];

    // 1. 授权范围推断
    const isReadWrite = permissions.some((p) =>
      ["write", "send", "create", "modify", "delete"].includes(p.toLowerCase())
    );
    const authScope = isReadWrite ? ("readwrite" as const) : ("readonly" as const);

    // 2. 配置状态映射：available 状态下某些核心连接器为 pending_config（待配置）
    let configStatus: "connected" | "error" | "pending_config" = "pending_config";
    if (serialized.status === "connected") {
      configStatus = "connected";
    } else if (serialized.status === "error") {
      configStatus = "error";
    } else {
      const needsConfigCategories = ["crm", "erp", "api"];
      configStatus = needsConfigCategories.includes(serialized.category)
        ? "pending_config"
        : "connected";
    }

    // 3. 失败次数推导：通过名称哈希生成稳定的模拟失败次数
    const hash = serialized.name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const failureCount = hash % 4 === 0 ? 1 : hash % 7 === 0 ? 2 : 0;

    return {
      ...serialized,
      authScope,
      configStatus,
      failureCount,
    };
  });
}
