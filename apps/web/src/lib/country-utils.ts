/**
 * ISO 两位国家代码 → 国旗 emoji
 * —— 复用此函数，避免在多个路由中重复实现
 *
 * 例: "US" → 🇺🇸, "CN" → 🇨🇳
 */
export function countryCodeToFlag(code: string): string {
  if (code.length !== 2) return "🌐"
  try {
    const codePoints = [...code.toUpperCase()].map(
      (c) => 0x1f1e6 + c.charCodeAt(0) - 65,
    )
    return String.fromCodePoint(...codePoints)
  } catch {
    return "🌐"
  }
}
