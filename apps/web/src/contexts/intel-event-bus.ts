/**
 * IntelEventBus — 模块级 SSE 事件总线（单例）
 *
 * 替代 IntelStreamContext 的 Context 推送模式。
 * 核心设计：每个面板独立订阅自己关心的事件类型，收到事件后自行 setState。
 * 不再有"一个 Context 值变化 → 全部 8 个面板强制重渲染"的问题。
 *
 * 用法：
 *   import { intelEventBus } from "@/contexts/intel-event-bus"
 *   useEffect(() => intelEventBus.on("flow.tick", (e) => setFlowTicks(prev => [...prev, e])), [])
 */

type EventHandler = (event: unknown) => void;

class IntelEventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  private sseController: AbortController | null = null;
  private mounted = false;
  private connecting: Promise<void> | null = null; // 防止并发连接

  /** 面板订阅特定事件类型 */
  on(eventType: string, handler: EventHandler): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(handler);

    // 异步触发 SSE 连接（防并发：用 Promise 锁确保只建一条）
    this.ensureSSE();

    return () => {
      this.listeners.get(eventType)?.delete(handler);
    };
  }

  emit(eventType: string, event: unknown): void {
    this.listeners.get(eventType)?.forEach((fn) => {
      try { fn(event); } catch { /* */ }
    });
    this.listeners.get("*")?.forEach((fn) => {
      try { fn({ type: eventType, event }); } catch { /* */ }
    });
  }

  /** Promise 锁：确保全局只有一条 SSE 连接 */
  private ensureSSE(): void {
    if (this.connecting) return;   // 正在连接中，复用
    if (this.sseController) return; // 已连接
    this.mounted = true;
    this.connecting = this.connectSSE().finally(() => {
      this.connecting = null;
    });
  }

  private async connectSSE(): Promise<void> {
    // 生产环境可配 INTEL_SANDBOX_URL 指向独立部署的沙盒服务
    const SANDBOX_URL = process.env.NEXT_PUBLIC_INTEL_SANDBOX_URL ?? "http://localhost:3001/stream";
    const FALLBACK_URL = "/api/v1/stream/industry-intel";

    let res: Response | null = null;
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      res = await fetch(SANDBOX_URL, { signal: ctrl.signal });
      clearTimeout(t);
    } catch { /* sandbox not available */ }

    if (!res?.ok || !res?.body) {
      try { res = await fetch(FALLBACK_URL); } catch { return; }
    }
    if (!res?.ok || !res?.body) return;

    this.sseController = new AbortController();
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const readLoop = async () => {
      try {
        while (this.mounted) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          for (const line of buffer.split("\n")) {
            const t = line.trim();
            if (!t || t.startsWith("event:") || t.startsWith(":")) continue;
            if (t.startsWith("data: ")) {
              try {
                const p = JSON.parse(t.slice(6));
                const type = (p.eventType as string) ?? "";
                this.emit(type, p);
                if (type === "intel.flow.tick") this.emit("flow.tick", p);
                if (type === "intel.signal.detected") this.emit("signal", p);
                if (type === "intel.topology.updated") this.emit("topology", p);
                if (type === "intel.alert.tactical") this.emit("alert", p);
                if (type === "intel.agent.heartbeat") this.emit("heartbeat", p);
                if (type === "intel.evolution.proposal-created") this.emit("proposal", p);
              } catch { /* */ }
            }
          }
          buffer = "";
        }
      } catch {
        if (this.mounted) {
          this.sseController = null;
          setTimeout(() => this.connectSSE(), 5000);
        }
      }
    };
    readLoop();
  }

  destroy(): void {
    this.mounted = false;
    this.sseController?.abort();
    this.sseController = null;
    this.listeners.clear();
  }
}

/** 全局单例 */
export const intelEventBus = new IntelEventBus();
