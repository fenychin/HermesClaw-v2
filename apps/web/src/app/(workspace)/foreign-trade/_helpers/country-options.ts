/**
 * 国家选项 + 标签映射
 *
 * P2-2 抽出：原本散落在 inquiry-quick-entry.tsx 中。
 * 与 src/lib/country-utils.ts 的 countryCodeToFlag 协作（emoji 由 utils 计算）。
 */

import { countryCodeToFlag } from "@/lib/country-utils"

export interface CountryOption {
  label: string
  value: string
}

export const COUNTRY_OPTIONS: CountryOption[] = [
  { label: "美国", value: "US" },
  { label: "德国", value: "DE" },
  { label: "英国", value: "GB" },
  { label: "法国", value: "FR" },
  { label: "澳大利亚", value: "AU" },
  { label: "加拿大", value: "CA" },
  { label: "日本", value: "JP" },
  { label: "韩国", value: "KR" },
  { label: "印度", value: "IN" },
  { label: "巴西", value: "BR" },
  { label: "阿联酋", value: "AE" },
  { label: "其他", value: "OTHER" },
]

const LABEL_MAP: Record<string, string> = COUNTRY_OPTIONS.reduce(
  (acc, opt) => {
    acc[opt.value] = opt.label
    return acc
  },
  {} as Record<string, string>,
)

/** 把 ISO 代码或自定义 OTHER 映射回中文标签；未知值原样返回 */
export function countryLabel(code: string): string {
  return LABEL_MAP[code] ?? code
}

/** 给 UI 用的 "🇺🇸 美国" 形式 */
export function countryWithFlag(code: string): string {
  if (!code) return ""
  if (code === "OTHER") return countryLabel(code)
  return `${countryCodeToFlag(code)} ${countryLabel(code)}`
}
