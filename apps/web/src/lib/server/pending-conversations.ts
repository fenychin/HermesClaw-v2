/**
 * 本地待保存对话队列（离线/保存失败兜底备份）
 * —— 对话历史是核心数据，任一次落库失败都先写入 localStorage，
 *    待网络/权限恢复后由 flushPendingConversations 原子回放进数据库。
 *
 * ⚠️ 仅客户端可用（依赖 localStorage）。
 */
import { apiClient } from "@/lib/api-client";

const LS_KEY = "hermes-pending-conversations";
/** 队列上限：超出按 FIFO 丢弃最旧（仅在极端持续失败时触发） */
const MAX_PENDING = 50;
/** 单条消息内容上限，与后端 ConversationMessageSchema 对齐，回放前兜底裁剪 */
const MAX_CONTENT = 100000;

/** 一条待回放的对话（单轮 user + assistant） */
export interface PendingConversation {
  userContent: string;
  assistantContent: string;
  time: number;
}

/** 读取并清洗队列（容错：非数组/损坏项一律剔除） */
function readQueue(): PendingConversation[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p): p is PendingConversation =>
        !!p &&
        typeof (p as PendingConversation).userContent === "string" &&
        typeof (p as PendingConversation).assistantContent === "string",
    );
  } catch {
    return [];
  }
}

/** 写回队列（保留最近 MAX_PENDING 条） */
function writeQueue(items: PendingConversation[]): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(items.slice(-MAX_PENDING)));
  } catch {
    /* localStorage 不可用（隐私模式/配额满）时静默降级 */
  }
}

/** 入队一条保存失败的对话 */
export function queuePendingConversation(entry: PendingConversation): void {
  const queue = readQueue();
  queue.push(entry);
  writeQueue(queue);
}

/** 当前待回放条数（供 UI 展示积压提示） */
export function getPendingCount(): number {
  return readQueue().length;
}

/** 内容兜底：空串补占位、超长裁剪，避免回放永久卡在校验失败 */
function safeContent(s: string): string {
  if (!s || s.length === 0) return "（空）";
  return s.length > MAX_CONTENT ? s.slice(0, MAX_CONTENT) : s;
}

/** 并发保护：避免挂载/online/成功回调同时触发重复回放 */
let isFlushing = false;
/** 连续失败计数：≥3 时通知用户，成功一次即清零 */
let consecutiveFailures = 0;

/** 返回连续失败次数（供调用方判断是否需要 toast） */
export function getFlushFailures(): number {
  return consecutiveFailures;
}

/**
 * 回放本地待保存对话队列。
 * —— 逐条原子导入（对话 + 两条消息单事务），成功一条立即从队列移除并落盘；
 *    任一条失败即停止，保留剩余项待下次（网络恢复 / 重新挂载）重试，确保不丢数据。
 * @returns 本次成功回放的条数
 */
export async function flushPendingConversations(): Promise<number> {
  if (isFlushing || typeof window === "undefined") return 0;
  let queue = readQueue();
  if (queue.length === 0) {
    // 队列已空，清零失败计数（此前失败可能已由其他 flush 修好）
    consecutiveFailures = 0;
    return 0;
  }

  isFlushing = true;
  let flushed = 0;
  try {
    while (queue.length > 0) {
      const entry = queue[0];
      try {
        const userContent = safeContent(entry.userContent);
        const title =
          userContent.length > 50 ? userContent.slice(0, 50) + "…" : userContent;
        await apiClient.importConversation(title, [
          { role: "user", content: userContent },
          { role: "assistant", content: safeContent(entry.assistantContent) },
        ]);
      } catch (err: any) {
        // 400 参数校验失败，说明数据格式有毒，绝对无法同步，直接丢弃（出队），防止卡死队列
        if (err?.status === 400 || err?.message === "参数验证失败") {
          console.warn("[pending-conversations] 检测到有毒积压数据 (400 校验失败)，执行丢弃以避免阻塞队列：", entry)
          queue = queue.slice(1)
          writeQueue(queue)
          continue
        }

        // 403 权限阻断，说明当前操作者或工作区没有写入权限（例如切换为了只读工作区或未登录）
        // 此时我们应该保留队列（break 退出），但不累加网络级别的 consecutiveFailures，避免因为权限切换导致网络错误弹窗疯狂报错
        if (err?.status === 403) {
          console.warn("[pending-conversations] 权限不足 (403)，暂停回放待切换权限后重试")
          break
        }

        // 仍失败（多半离线 / 服务端错误）→ 停止，保留队列待下次重试
        consecutiveFailures++
        break
      }
      queue = queue.slice(1)
      writeQueue(queue) // 成功一条即落盘，杜绝回放中途崩溃丢进度
      flushed++
      consecutiveFailures = 0 // 至少成功一条即清零
    }
  } finally {
    isFlushing = false
  }
  return flushed;
}
