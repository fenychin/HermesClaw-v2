import { prisma } from "../apps/web/src/lib/prisma";

async function main() {
  try {
    console.log("=== 开始扫描数据库中的重复智能体 ===");
    const agents = await prisma.agent.findMany({
      select: {
        id: true,
        name: true,
        workspaceId: true,
        createdAt: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    console.log(`共找到 ${agents.length} 个智能体`);

    // 按照 workspaceId + name 进行分组
    const groups: Record<string, typeof agents> = {};
    for (const agent of agents) {
      const key = `${agent.workspaceId}:${agent.name}`;
      if (!groups[key]) {
        groups[key] = [];
      }
      groups[key].push(agent);
    }

    let deletedCount = 0;
    for (const [key, list] of Object.entries(groups)) {
      if (list.length > 1) {
        console.log(`发现重复的智能体: [${key}]，共有 ${list.length} 个版本`);
        // 既然我们在查询时使用了 orderBy: { createdAt: "desc" }
        // 那么 list[0] 就是最新创建的那一个，我们将其保留
        const keep = list[0];
        const toDelete = list.slice(1);
        console.log(`-> 保留最新版 ID: ${keep.id} (创建时间: ${keep.createdAt.toISOString()})`);
        for (const item of toDelete) {
          console.log(`-> 正在删除旧版本 ID: ${item.id} (创建时间: ${item.createdAt.toISOString()})`);
          await prisma.agent.delete({
            where: { id: item.id }
          });
          deletedCount++;
        }
      }
    }

    console.log(`=== 清理完毕，共清除了 ${deletedCount} 个重复的旧版本智能体 ===`);
  } catch (error) {
    console.error("❌ 清理重复智能体时发生错误:", error);
  } finally {
    process.exit(0);
  }
}

main();
