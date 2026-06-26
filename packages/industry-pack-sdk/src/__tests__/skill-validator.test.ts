import { describe, it, expect } from "vitest"
import { validateSkillMd, parseFrontmatter } from "../skill-validator"

describe("SKILL.md Validation Service Tests", () => {
  describe("validateSkillMd", () => {
    it("should successfully validate a correct SKILL.md", () => {
      const content = `---
name: inquiry-sorter
description: Automatically sort incoming inquiries.
---
# Inquiry Sorter
Detail text goes here.`
      
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it("should fail if content is empty", () => {
      const result = validateSkillMd("")
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("SKILL.md 内容为空")
    })

    it("should fail if frontmatter is missing", () => {
      const content = `# Title\nNo frontmatter here.`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain("缺少有效的前言定义")
    })

    it("should fail if name is missing", () => {
      const content = `---
description: Missing name.
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("前言中缺少必填字段 'name'")
    })

    it("should fail if name is not match regex", () => {
      const content = `---
name: Inquiry Sorter!
description: Invalid name.
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(false)
      expect(result.errors[0]).toContain("前言中 'name' 字段不合法")
    })

    it("should fail if description is missing", () => {
      const content = `---
name: inquiry-sorter
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(false)
      expect(result.errors).toContain("前言中缺少必填字段 'description'")
    })

    it("should provide suggestions if description is too short", () => {
      const content = `---
name: inquiry-sorter
description: Short
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.suggestions).toHaveLength(1)
      expect(result.suggestions[0]).toContain("建议至少 10 个字符")
    })

    it("should warn if version is missing", () => {
      const content = `---
name: inquiry-sorter
description: Automatically sort incoming inquiries.
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.warnings).toContain("建议添加 'version' 字段声明技能版本（例如: version: 1.0.0）")
    })

    it("should warn if version is empty", () => {
      const content = `---
name: inquiry-sorter
description: Automatically sort incoming inquiries.
version:
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.warnings).toContain("建议添加 'version' 字段声明技能版本（例如: version: 1.0.0）")
    })

    it("should pass without warnings if version is present", () => {
      const content = `---
name: inquiry-sorter
description: Automatically sort incoming inquiries.
version: 1.0.0
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.warnings).not.toContain("建议添加 'version' 字段声明技能版本（例如: version: 1.0.0）")
    })

    it("should warn if tools is not an array", () => {
      const content = `---
name: inquiry-sorter
description: Automatically sort incoming inquiries.
tools: not-an-array
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.warnings).toContain("'tools' 字段必须为数组格式")
    })

    it("should warn if tools is an empty array", () => {
      const content = `---
name: inquiry-sorter
description: Automatically sort incoming inquiries.
tools: []
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.warnings).toContain("'tools' 数组为空，如需声明工具请补充条目")
    })

    it("should pass without tools warnings if tools is a non-empty array", () => {
      const content = `---
name: inquiry-sorter
description: Automatically sort incoming inquiries.
version: 1.0.0
tools:
  - name: search
    description: Search the web
---`
      const result = validateSkillMd(content)
      expect(result.valid).toBe(true)
      expect(result.warnings).toHaveLength(0)
    })
  })

  describe("parseFrontmatter", () => {
    it("should parse valid frontmatter", () => {
      const content = `---
name: inquiry-sorter
description: Test
version: 1.0.0
---`
      const fm = parseFrontmatter(content)
      expect(fm).not.toBeNull()
      expect(fm?.name).toBe("inquiry-sorter")
      expect(fm?.version).toBe("1.0.0")
    })

    it("should return null for invalid frontmatter", () => {
      const fm = parseFrontmatter("invalid yaml ---")
      expect(fm).toBeNull()
    })
  })
})
