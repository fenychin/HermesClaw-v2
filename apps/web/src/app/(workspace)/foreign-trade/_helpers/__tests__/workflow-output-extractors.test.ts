import { describe, it, expect } from "vitest"
import {
  extractDevLetter,
  extractGradeInfo,
} from "../workflow-output-extractors"

describe("extractDevLetter", () => {
  it("从 nodeId → result.{subject,body} 中能取到草稿", () => {
    const out = {
      "n4-email": { result: { subject: "Hi", body: "Body content" } },
    }
    expect(extractDevLetter(out)).toEqual({ subject: "Hi", body: "Body content" })
  })

  it("当 nodeResult 顶层就含 subject/body 时也能识别", () => {
    const out = { "n-email": { subject: "X", body: "Y" } }
    expect(extractDevLetter(out)).toEqual({ subject: "X", body: "Y" })
  })

  it("无任何节点输出含 subject/body 时返回 null", () => {
    expect(extractDevLetter({ n1: { foo: "bar" } })).toBeNull()
  })

  it("非对象输入直接返回 null", () => {
    expect(extractDevLetter(null)).toBeNull()
    expect(extractDevLetter("oops")).toBeNull()
  })

  it("过多键（>50）的对象视为异常入参直接 bail", () => {
    const huge: Record<string, unknown> = {}
    for (let i = 0; i < 60; i++) huge[`k${i}`] = { subject: "a", body: "b" }
    expect(extractDevLetter(huge)).toBeNull()
  })
})

describe("extractGradeInfo", () => {
  it("正常映射 grade/score/analysis/suggestedAction", () => {
    const out = {
      "n-grade": {
        result: {
          grade: "A",
          score: 92,
          analysis: "高质量询盘",
          suggestedAction: "1 小时内回复",
        },
      },
    }
    expect(extractGradeInfo(out)).toEqual({
      grade: "A",
      score: 92,
      analysis: "高质量询盘",
      suggestedAction: "1 小时内回复",
    })
  })

  it("score 为字符串时也能 parse", () => {
    const out = { n: { result: { grade: "B", score: "75" } } }
    expect(extractGradeInfo(out)?.score).toBe(75)
  })

  it("无 grade 字段返回 null", () => {
    expect(extractGradeInfo({ n: { result: { score: 80 } } })).toBeNull()
  })
})
