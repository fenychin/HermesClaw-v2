/**
 * SSE 解析器单元测试（parseSSEStream）
 *
 * 覆盖要点：
 *   - 标准 SSE data 行解析
 *   - [DONE] 结束标记
 *   - 多行事件累积
 *   - 空行/注释行跳过
 *   - JSON 解析错误处理
 *   - 自定义结束标记
 *   - 流自然结束
 *   - reader 资源释放
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseSSEStream, type SSEStreamOptions } from "@/lib/sse-parser";

// ---- 辅助函数：构造模拟 ReadableStream reader ----

interface Chunk {
  done: boolean;
  value?: Uint8Array;
}

function createMockReader(chunks: Chunk[]): ReadableStreamDefaultReader<Uint8Array> {
  let index = 0;
  const released = { current: false };
  return {
    read: vi.fn<() => Promise<ReadableStreamReadResult<Uint8Array>>>(() => {
      const chunk = chunks[index];
      index = Math.min(index + 1, chunks.length);
      if (!chunk) {
        return Promise.resolve({ done: true, value: undefined });
      }
      return Promise.resolve({ done: chunk.done, value: chunk.value ?? new Uint8Array() });
    }),
    releaseLock: vi.fn(() => { released.current = true; }),
    cancel: vi.fn(),
    closed: Promise.resolve(undefined),
  } as unknown as ReadableStreamDefaultReader<Uint8Array>;
}

/** 编码字符串为 Uint8Array */
function encode(data: string): Uint8Array {
  return new TextEncoder().encode(data);
}

// ---- 测试用例 ----

describe("parseSSEStream", () => {
  let onData: ReturnType<typeof vi.fn<(data: unknown) => void>>;
  let onDone: ReturnType<typeof vi.fn<() => void>>;
  let onParseError: ReturnType<typeof vi.fn<(line: string, error: unknown) => void>>;

  beforeEach(() => {
    onData = vi.fn();
    onDone = vi.fn();
    onParseError = vi.fn();
  });

  function buildOptions(overrides?: Partial<SSEStreamOptions>): SSEStreamOptions {
    return { onData, onDone, onParseError, ...overrides };
  }

  // ==========================================
  // 标准事件
  // ==========================================

  it("解析单条 SSE data 行", async () => {
    const reader = createMockReader([
      { done: false, value: encode('data: {"text":"hello"}\n\n') },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions());
    expect(onData).toHaveBeenCalledOnce();
    expect(onData).toHaveBeenCalledWith({ text: "hello" });
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("解析多条连续事件", async () => {
    const reader = createMockReader([
      { done: false, value: encode('data: {"a":1}\n\ndata: {"b":2}\n\ndata: {"c":3}\n\n') },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions());
    expect(onData).toHaveBeenCalledTimes(3);
    expect(onData).toHaveBeenNthCalledWith(1, { a: 1 });
    expect(onData).toHaveBeenNthCalledWith(2, { b: 2 });
    expect(onData).toHaveBeenNthCalledWith(3, { c: 3 });
    expect(onDone).toHaveBeenCalledOnce();
  });

  // ==========================================
  // 结束标记 [DONE]
  // ==========================================

  it("收到 [DONE] 时停止解析并回调 onDone", async () => {
    const chunks: Chunk[] = [
      { done: false, value: encode('data: {"text":"first"}\n\n') },
      { done: false, value: encode("data: [DONE]\n\n") },
      { done: false, value: encode('data: {"text":"should-not-arrive"}\n\n') },
      { done: true },
    ];
    const reader = createMockReader(chunks);
    await parseSSEStream(reader, buildOptions());
    expect(onData).toHaveBeenCalledTimes(1);
    expect(onData).toHaveBeenCalledWith({ text: "first" });
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 自定义结束标记
  // ==========================================

  it("支持自定义 doneMarker", async () => {
    const reader = createMockReader([
      { done: false, value: encode("data: END_OF_STREAM\n\n") },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions({ doneMarker: "END_OF_STREAM" }));
    expect(onData).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
  });

  // ==========================================
  // doneMarker: null（仅靠流自然结束）
  // ==========================================

  it("doneMarker 为 null 时仅靠流结束触发 onDone", async () => {
    const reader = createMockReader([
      { done: false, value: encode('data: {"text":"ok"}\n\n') },
      { done: false, value: encode("data: [DONE]\n\n") },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions({ doneMarker: null }));
    // [DONE] 被视为普通数据，尝试 JSON.parse("[DONE]") 会成功（它是合法 JSON 数组）
    // 实际中 JSON.parse("[DONE]") 会失败，触发 onParseError
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  // ==========================================
  // 空白行 / 注释行
  // ==========================================

  it("跳过空行和非 data 行", async () => {
    const reader = createMockReader([
      { done: false, value: encode('\n: comment line\nevent: ping\ndata: {"real":true}\n\n\n') },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions());
    expect(onData).toHaveBeenCalledOnce();
    expect(onData).toHaveBeenCalledWith({ real: true });
  });

  it("跳过仅有空格的 data 行", async () => {
    const reader = createMockReader([
      { done: false, value: encode("data:   \n\n") },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions());
    // trimmed === "data:" → startsWith("data: ") → false (no space after colon)
    // Actually: "data:   " trimmed → "data:" which doesn't start with "data: "
    // Wait: "data:   " → startsWith("data: ") → yes ("data: " is prefix)
    // slice(6) → "  " → trimmed should not trigger JSON parse
    expect(onData).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
  });

  // ==========================================
  // 跨 chunk 拼接
  // ==========================================

  it("跨多个 chunk 拼接不完整行", async () => {
    const reader = createMockReader([
      { done: false, value: encode('data: {"tex') },
      { done: false, value: encode('t":"hello"}\n\n') },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions());
    expect(onData).toHaveBeenCalledOnce();
    expect(onData).toHaveBeenCalledWith({ text: "hello" });
  });

  // ==========================================
  // JSON 解析错误
  // ==========================================

  it("JSON 解析失败时调用 onParseError", async () => {
    const reader = createMockReader([
      { done: false, value: encode("data: not-valid-json\n\n") },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions());
    expect(onData).not.toHaveBeenCalled();
    expect(onParseError).toHaveBeenCalledWith("not-valid-json", expect.any(Error));
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("无 onParseError 时 JSON 异常静默跳过", async () => {
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reader = createMockReader([
      { done: false, value: encode("data: bad-json\n\n") },
      { done: true },
    ]);
    await parseSSEStream(reader, { onData, onDone });
    expect(onData).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledOnce();
    expect(consoleWarn).toHaveBeenCalledWith(
      "[SSE Parser] JSON 解析失败，已跳过该帧",
      expect.any(Object),
    );
    consoleWarn.mockRestore();
  });

  // ==========================================
  // 流自然结束（无 [DONE]）
  // ==========================================

  it("流自然结束时触发 onDone", async () => {
    const reader = createMockReader([
      { done: false, value: encode('data: {"last":true}\n\n') },
      { done: true },
    ]);
    await parseSSEStream(reader, buildOptions());
    expect(onData).toHaveBeenCalledWith({ last: true });
    expect(onDone).toHaveBeenCalledOnce();
  });

  // ==========================================
  // reader.releaseLock 异常
  // ==========================================

  it("reader.releaseLock 抛出异常时不影响流", async () => {
    const reader = createMockReader([
      { done: false, value: encode('data: {"ok":true}\n\n') },
      { done: true },
    ]);
    (reader.releaseLock as ReturnType<typeof vi.fn>).mockImplementation(() => {
      throw new Error("Already released");
    });
    // 不应抛出异常
    await parseSSEStream(reader, buildOptions());
    expect(onData).toHaveBeenCalledWith({ ok: true });
    expect(onDone).toHaveBeenCalledOnce();
  });
});
