import matter from "gray-matter"

const NAME_REGEX = /^[a-z0-9-]+$/

export interface SkillMdValidationResult {
  valid: boolean
  errors: string[]
  suggestions: string[]
}

/**
 * 用 gray-matter 简易解析前言
 */
export function parseFrontmatter(content: string): Record<string, any> | null {
  try {
    const parsed = matter(content)
    if (!parsed.data || Object.keys(parsed.data).length === 0) {
      return null
    }
    return parsed.data
  } catch {
    return null
  }
}

/**
  * 校验 SKILL.md Markdown 内容的前言（frontmatter）格式
  * 
  * 规则：
  * 1. 必须包含 name 字段，且格式必须为小写字母、数字和连字符 (name must match /^[a-z0-9-]+$/)
  * 2. 必须包含 description 字段，且不能为空
  */
export function validateSkillMd(content: string): SkillMdValidationResult {
  const errors: string[] = []
  const suggestions: string[] = []

  if (!content || content.trim().length === 0) {
    return {
      valid: false,
      errors: ["SKILL.md 内容为空"],
      suggestions: ["请输入有效的 SKILL.md Markdown 内容，并包含前言定义"]
    }
  }

  try {
    const parsed = matter(content)
    const { data } = parsed

    if (!data || typeof data !== "object" || Object.keys(data).length === 0) {
      errors.push("SKILL.md 缺少有效的前言定义（Frontmatter）。前言应以 '---' 包裹。")
      return { valid: false, errors, suggestions }
    }

    const { name, description } = data

    // 1. name 校验
    if (name === undefined || name === null) {
      errors.push("前言中缺少必填字段 'name'")
    } else if (typeof name !== "string") {
      errors.push("前言中 'name' 字段必须为字符串类型")
    } else {
      const trimmedName = name.trim()
      if (trimmedName.length === 0) {
        errors.push("前言中 'name' 字段不能为空")
      } else if (!NAME_REGEX.test(trimmedName)) {
        errors.push(`前言中 'name' 字段不合法: "${trimmedName}"。只能包含小写字母、数字 and 连字符 (例如: inquiry-sorter)`)
      }
    }

    // 2. description 校验
    if (description === undefined || description === null) {
      errors.push("前言中缺少必填字段 'description'")
    } else if (typeof description !== "string") {
      errors.push("前言中 'description' 字段必须为字符串类型")
    } else {
      const trimmedDesc = description.trim()
      if (trimmedDesc.length === 0) {
        errors.push("前言中 'description' 字段不能为空")
      } else if (trimmedDesc.length < 10) {
        suggestions.push(`技能描述建议至少 10 个字符，当前长度仅为 ${trimmedDesc.length} 字符。`)
      }
    }

  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err)
    errors.push(`Frontmatter 解析失败: ${errMsg}`)
  }

  return {
    valid: errors.length === 0,
    errors,
    suggestions
  }
}
