/**
 * 通用 SSE 流解析器
 * —— 从 ReadableStream<Uint8Array> 中逐行解析 SSE 格式的数据帧。
 *
 * 标准 SSE 格式：
 *   data: <JSON payload>\n\n
 *   结束标记：data: [DONE]\n\n
 *
 * 可复用于 /api/chat、/api/openclaw/events 等所有 SSE 端点。
 */

/** SSE 流配置选项 */
export interface SSEStreamOptions {
  /** 每解析到一条 data: 行时回调（已 JSON.parse） */
  onData: (data: unknown) => void
  /** 流自然结束或收到 [DONE] 标记时回调 */
  onDone?: () => void
  /** 解析出错时回调（默认 console.warn；不中断流） */
  onParseError?: (line: string, error: unknown) => void
  /** 自定义结束标记（默认 "[DONE]"）；传 null 表示仅靠流自然结束 */
  doneMarker?: string | null
}

/**
 * 消费一个 SSE ReadableStream，逐行解析并回调。
 *
 * @param reader  ReadableStreamDefaultReader<Uint8Array>（由 response.body.getReader() 获取）
 * @param options 解析配置
 * @returns Promise<void>，在流完全结束后 resolve
 *
 * 使用示例：
 *   const reader = response.body!.getReader()
 *   await parseSSEStream(reader, {
 *     onData: (json) => { setMessages(...) },
 *     onDone: () => { setIsStreaming(false) },
 *   })
 */
export async function parseSSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  options: SSEStreamOptions,
): Promise<void> {
  const { onData, onDone, onParseError, doneMarker = '[DONE]' } = options
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      // 保留最后一个不完整行
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data: ')) continue

        const data = trimmed.slice(6)

        // 结束标记检测
        if (doneMarker !== null && data === doneMarker) {
          onDone?.()
          return
        }

        try {
          const parsed = JSON.parse(data)
          onData(parsed)
        } catch (e) {
          if (onParseError) {
            onParseError(data, e)
          } else {
            console.warn('[SSE Parser] JSON 解析失败，已跳过该帧', {
              data: data.slice(0, 120),
            })
          }
        }
      }
    }
  } finally {
    // 确保 reader 资源释放
    try {
      reader.releaseLock()
    } catch {
      // reader 可能已被 cancel 释放
    }
  }

  onDone?.()
}
