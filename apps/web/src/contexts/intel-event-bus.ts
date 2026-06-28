/**
 * IntelEventBus — 模块级 SSE 事件总线（单例）
 *
 * 替代 IntelStreamContext 的 Context 推送模式。
 * 核心设计：每个面板独立订阅自己关心的事件类型，收到事件后自行 setState。
 * 不再有"一个 Context 值变化 → 全部 8 个面板强制重渲染"的问题。
 *
 * v3.43 升级：
 * - 指数退避重连 (1s, 2s, 4s, 8s, 16s, 30s max)
 * - mock 模式检测（响应头 X-Intel-Sandbox: mock → 上报 store）
 * - 连接状态同步到 Zustand store（供 IntelTopBar 等组件使用）
 * - 重连超过 3 次后降级到 polling 模式
 *
 * 用法：
 *   import { intelEventBus } from "@/contexts/intel-event-bus"
 *   useEffect(() => intelEventBus.on("flow.tick", (e) => setFlowTicks(prev => [...prev, e])), [])
 */

type EventHandler = (event: unknown) => void;

/** SSE 数据源模式 */
export type SSEDataMode = "real" | "mock" | "unknown";

/** 连接状态（与 store 同步） */
export type IntelEventBusStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "reconnecting"
  | "fallback-polling";

class IntelEventBus {
  private listeners = new Map<string, Set<EventHandler>>();
  private sseController: AbortController | null = null;
  private mounted = false;
  private connecting: Promise<void> | null = null; // Promise 锁：确保全局只有一条 SSE 连接

  // ─── 重连控制 ──────────────────────────────────────────────
  private reconnectAttempt = 0;
  private readonly MAX_RECONNECT_ATTEMPTS = 6;
  private readonly RECONNECT_BASE_MS = 1000;
  private readonly RECONNECT_MAX_MS = 30_000;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // ─── polling fallback ─────────────────────────────────────
  private pollingInterval: ReturnType<typeof setInterval> | null = null;

  // ─── 状态 ─────────────────────────────────────────────────
  private _status: IntelEventBusStatus = "disconnected";
  private _dataMode: SSEDataMode = "unknown";
  private statusListeners = new Set<(status: IntelEventBusStatus, mode: SSEDataMode) => void>();

  /** 获取当前连接状态 */
  get status(): IntelEventBusStatus { return this._status; }

  /** 获取当前数据源模式 */
  get dataMode(): SSEDataMode { return this._dataMode; }

  /** 设置状态并通知监听者 */
  private setStatus(status: IntelEventBusStatus, mode?: SSEDataMode): void {
    this._status = status;
    if (mode !== undefined) this._dataMode = mode;
    this.statusListeners.forEach((fn) => {
      try { fn(status, this._dataMode); } catch { /* 静默 */ }
    });
    // 同步到 Zustand store（如果可用）
    this.syncToStore(status);
  }

  /** 定阅连接状态变化 */
  onStatusChange(fn: (status: IntelEventBusStatus, mode: SSEDataMode) => void): () => void {
    this.statusListeners.add(fn);
    // 立即通知当前状态
    fn(this._status, this._dataMode);
    return () => { this.statusListeners.delete(fn); };
  }

  /** 同步连接状态到 Zustand store */
  private syncToStore(status: IntelEventBusStatus): void {
    try {
      const { useIndustryIntelStore } = require("@/stores/industry-intel-store");
      const store = useIndustryIntelStore.getState?.();
      if (store?.setSSEStatus) {
        // v3.43: fallback-polling 不再映射为 connected，
        // 直接写入完整状态让 IntelTopBar 区分真实 SSE 和 polling 降级
        store.setSSEStatus(status as "connected" | "disconnected" | "connecting" | "reconnecting" | "fallback-polling");
      }
    } catch { /* store 不可用 */ }
  }

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

  /** 手动重连（供外部调用） */
  reconnect(): void {
    this.disconnectInternal();
    this.reconnectAttempt = 0;
    this.setStatus("connecting");
    this.ensureSSE();
  }

  private async connectSSE(): Promise<void> {
    // 重置重连计数器
    if (this.reconnectAttempt === 0) {
      this.setStatus("connecting");
    }

    // 生产环境可配 INTEL_SANDBOX_URL 指向独立部署的沙盒服务
    const SANDBOX_URL = process.env.NEXT_PUBLIC_INTEL_SANDBOX_URL ?? "http://localhost:3001/stream";
    const FALLBACK_URL = "/api/v1/stream/industry-intel";

    let res: Response | null = null;
    let dataMode: SSEDataMode = "unknown";

    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 2000);
      res = await fetch(SANDBOX_URL, { signal: ctrl.signal });
      clearTimeout(t);
      // 检测沙盒响应头中的 mode
      const sandboxMode = res?.headers.get("X-Intel-Data-Mode");
      if (sandboxMode === "mock") dataMode = "mock";
      else if (sandboxMode === "real") dataMode = "real";
    } catch { /* sandbox not available */ }

    if (!res?.ok || !res?.body) {
      try {
        res = await fetch(FALLBACK_URL);
        // 检测降级代理响应头
        const proxyMode = res?.headers.get("X-Intel-Data-Mode");
        if (proxyMode === "mock") dataMode = "mock";
        else if (proxyMode === "real") dataMode = "real";
        // 从 X-Intel-Sandbox 推断
        const sandboxHeader = res?.headers.get("X-Intel-Sandbox");
        if (sandboxHeader === "fallback" && dataMode === "unknown") {
          dataMode = "mock"; // fallback 内联模式大多是 mock
        }
      } catch {
        this.handleConnectFailure();
        return;
      }
    }

    if (!res?.ok || !res?.body) {
      this.handleConnectFailure();
      return;
    }

    // 连接成功
    this.reconnectAttempt = 0;
    this.setStatus("connected", dataMode);

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
          // SSE 消息按 \n\n 分割
          const frames = buffer.split("\n\n");
          buffer = frames.pop() ?? "";

          for (const frame of frames) {
            if (!frame.trim()) continue;
            const lines = frame.split("\n");
            let eventType = "";
            let dataStr = "";

            for (const line of lines) {
              const trimmed = line.trim();
              if (trimmed.startsWith("event: ")) {
                eventType = trimmed.slice(7);
              } else if (trimmed.startsWith("data: ")) {
                dataStr = trimmed.slice(6);
              }
            }

            if (dataStr) {
              try {
                const parsed = JSON.parse(dataStr);
                const type = (parsed.eventType as string) ?? eventType;
                if (type) {
                  this.emit(type, parsed);
                  // 同时发射简化别名
                  if (type === "intel.flow.tick") this.emit("flow.tick", parsed);
                  if (type === "intel.signal.detected") this.emit("signal", parsed);
                  if (type === "intel.topology.updated") this.emit("topology", parsed);
                  if (type === "intel.alert.tactical") this.emit("alert", parsed);
                  if (type === "intel.agent.heartbeat") this.emit("heartbeat", parsed);
                  if (type === "intel.evolution.proposal-created") this.emit("proposal", parsed);
                }
              } catch { /* 解析失败跳过 */ }
            }
          }
        }
      } catch {
        // 读取中断 — 触发重连
      }

      // 连接断开
      if (this.mounted && this.sseController) {
        this.sseController = null;
        this.scheduleReconnect();
      }
    };
    readLoop();
  }

  /** 指数退避重连 */
  private scheduleReconnect(): void {
    if (!this.mounted) return;
    if (this.reconnectAttempt >= this.MAX_RECONNECT_ATTEMPTS) {
      this.fallbackToPolling();
      return;
    }

    this.reconnectAttempt++;
    const delay = Math.min(
      this.RECONNECT_BASE_MS * 2 ** (this.reconnectAttempt - 1),
      this.RECONNECT_MAX_MS,
    );
    // 加随机抖动 ±25%
    const jitter = delay * (0.75 + Math.random() * 0.5);

    this.setStatus("reconnecting");

    console.log(
      `[IntelEventBus] 重连 ${this.reconnectAttempt}/${this.MAX_RECONNECT_ATTEMPTS} ` +
      `— ${Math.round(jitter / 1000)}s 后`,
    );

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      if (!this.mounted) return;
      this.connectSSE();
    }, jitter);
  }

  /** 降级到 polling 模式（30s 间隔） */
  private fallbackToPolling(): void {
    console.warn(
      `[IntelEventBus] SSE 重连 ${this.reconnectAttempt} 次失败，降级到 polling 模式（30s）`,
    );
    this.setStatus("fallback-polling");
    this.emit("mode-change", { mode: "fallback-polling" });

    this.pollingInterval = setInterval(() => {
      if (!this.mounted) {
        this.stopPolling();
        return;
      }
      // 通过 REST API 轮询最新数据
      fetch("/api/v1/harness/evolution-log?limit=5")
        .then((r) => r.json().catch(() => null))
        .then((json) => {
          if (json?.data?.logs?.length) {
            this.emit("polling-update", { logs: json.data.logs });
          }
        })
        .catch(() => { /* 静默 */ });
    }, 30_000);
  }

  private stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }

  private handleConnectFailure(): void {
    // 连接失败，触发重连
    this.scheduleReconnect();
  }

  private disconnectInternal(): void {
    this.sseController?.abort();
    this.sseController = null;
    this.reconnectTimer && clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    this.stopPolling();
  }

  /** 销毁总线（页面卸载时调用） */
  destroy(): void {
    this.mounted = false;
    this.disconnectInternal();
    this.listeners.clear();
    this.statusListeners.clear();
    this.setStatus("disconnected");
  }
}

/** 全局单例 */
export const intelEventBus = new IntelEventBus();
