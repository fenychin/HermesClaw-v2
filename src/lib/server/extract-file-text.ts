/**
 * 文件文本提取工具
 * —— 服务端统一入口，从上传文件 Buffer 中提取可读文本，供 LLM 分析使用。
 *
 * 支持格式：PDF / DOCX / XLSX / XLS / CSV / TSV / 纯文本
 * 不支持：图片（需 OCR，暂不引入）、压缩包
 */

import { logger } from "@/lib/logger";

/** 文本提取结果 */
export interface ExtractResult {
  /** 提取成功 */
  ok: boolean;
  /** 提取的文本内容（成功时） */
  content?: string;
  /** 错误或说明信息 */
  note?: string;
}

/** 提取的最大字符数（避免超大文件撑爆上下文） */
const MAX_CHARS = 12000;

/**
 * 从文件 Buffer 中提取文本
 * @param buffer   文件二进制内容
 * @param mimeType MIME 类型（如 application/pdf）
 * @param fileName 文件名（用于判断扩展名）
 */
export async function extractFileText(
  buffer: Buffer,
  mimeType: string,
  fileName: string,
): Promise<ExtractResult> {
  const ext = fileName.toLowerCase().slice(fileName.lastIndexOf("."));

  try {
    // PDF
    if (mimeType === "application/pdf" || ext === ".pdf") {
      return await extractPdf(buffer);
    }

    // DOCX
    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      ext === ".docx"
    ) {
      return await extractDocx(buffer);
    }

    // XLSX / XLS
    if (
      mimeType ===
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
      mimeType === "application/vnd.ms-excel" ||
      ext === ".xlsx" ||
      ext === ".xls"
    ) {
      return await extractSpreadsheet(buffer);
    }

    // CSV / TSV
    if (mimeType === "text/csv" || ext === ".csv" || ext === ".tsv") {
      return await extractSpreadsheet(buffer);
    }

    // 纯文本 / JSON / XML / Markdown 等
    if (
      mimeType.startsWith("text/") ||
      mimeType === "application/json" ||
      [".txt", ".md", ".json", ".xml", ".html", ".htm", ".log", ".yaml", ".yml"].includes(ext)
    ) {
      return extractPlainText(buffer);
    }

    // 图片 / 其他二进制
    return {
      ok: false,
      note: `此文件类型 (${mimeType || ext}) 暂不支持文本提取，仅能作为附件引用。`,
    };
  } catch (err) {
    logger.warn("extractFileText: 提取失败", {
      fileName,
      mimeType,
      error: err instanceof Error ? err.message : "未知错误",
    });
    return {
      ok: false,
      note: `文本提取失败: ${err instanceof Error ? err.message : "未知错误"}`,
    };
  }
}

/** PDF 文本提取 */
async function extractPdf(buffer: Buffer): Promise<ExtractResult> {
  // pdf-parse v2: 使用 PDFParse 类
  const { PDFParse } = await import("pdf-parse");
  const parser = new (PDFParse as unknown as new (opts: { data: Buffer }) => { getAllText: () => Promise<string | { text?: string }> })({ data: buffer });
  const textResult = await parser.getAllText();
  const text = truncate(
    typeof textResult === "string" ? textResult : (textResult as { text?: string })?.text ?? String(textResult),
    MAX_CHARS,
  );
  if (!text.trim()) {
    return { ok: false, note: "PDF 未包含可提取文本（可能是扫描图片型 PDF）" };
  }
  return { ok: true, content: text };
}

/** DOCX 文本提取 */
async function extractDocx(buffer: Buffer): Promise<ExtractResult> {
  const mammoth = await import("mammoth");
  const result = await mammoth.extractRawText({ buffer });
  const text = truncate(result.value, MAX_CHARS);
  if (!text.trim()) {
    return { ok: false, note: "DOCX 文档内容为空" };
  }
  // 附上 mammoth 的警告信息
  const warnings = result.messages
    .filter((m) => m.type === "warning")
    .map((m) => m.message)
    .join("; ");
  return {
    ok: true,
    content: text,
    note: warnings ? `DOCX 解析警告: ${warnings}` : undefined,
  };
}

/** 电子表格文本提取（XLSX / XLS / CSV / TSV） */
async function extractSpreadsheet(buffer: Buffer): Promise<ExtractResult> {
  // xlsx 为 CJS 模块，需类型绕过
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const XLSX: { read(buf: Buffer, opts: { type: "buffer"; codepage?: number }): { SheetNames: string[]; Sheets: Record<string, unknown> }; utils: { sheet_to_csv(sheet: unknown, opts?: { blankrows?: boolean }): string } } = await import("xlsx") as any;
  const workbook = XLSX.read(buffer, { type: "buffer", codepage: 65001 });
  const sheetNames: string[] = workbook.SheetNames;

  const parts: string[] = [];
  const MAX_SHEETS = 3; // 最多处理 3 个工作表

  for (let i = 0; i < Math.min(sheetNames.length, MAX_SHEETS); i++) {
    const name = sheetNames[i];
    const sheet = workbook.Sheets[name];
    const csvText = XLSX.utils.sheet_to_csv(sheet, { blankrows: false });
    if (csvText.trim()) {
      if (sheetNames.length > 1) {
        parts.push(`--- 工作表: ${name} ---\n${csvText}`);
      } else {
        parts.push(csvText);
      }
    }
  }

  if (parts.length === 0) {
    return { ok: false, note: "电子表格无有效数据" };
  }

  const fullText = parts.join("\n\n");
  const text = truncate(fullText, MAX_CHARS);

  const skipped =
    sheetNames.length > MAX_SHEETS
      ? `（共 ${sheetNames.length} 个工作表，仅展示前 ${MAX_SHEETS} 个）`
      : "";

  return { ok: true, content: text, note: skipped || undefined };
}

/** 纯文本直接读取 */
function extractPlainText(buffer: Buffer): ExtractResult {
  const text = truncate(buffer.toString("utf-8"), MAX_CHARS);
  if (!text.trim()) {
    return { ok: false, note: "文件内容为空" };
  }
  return { ok: true, content: text };
}

/** 截断到 maxChars */
function truncate(text: string, maxChars: number): string {
  return text.length > maxChars
    ? text.slice(0, maxChars) + `\n…(内容已截断，原始长度 ${text.length} 字符)`
    : text;
}
