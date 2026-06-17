import { describe, it, expect } from "vitest"
import { buildStepInputs } from "../step-input-builder"

describe("buildStepInputs", () => {
  it("skill 节点产出 1 个 textarea 输入字段（required）", () => {
    const inputs = buildStepInputs({ id: "n1", kind: "skill" }, 0)
    expect(inputs).toHaveLength(1)
    expect(inputs[0].type).toBe("textarea")
    expect(inputs[0].required).toBe(true)
    expect(inputs[0].placeholder).toContain("询盘")
  })

  it("非首个 skill 节点 placeholder 为补充信息提示", () => {
    const inputs = buildStepInputs({ id: "n2", kind: "skill" }, 1)
    expect(inputs[0].placeholder).toContain("补充信息")
  })

  it("data-write 节点不需要输入", () => {
    expect(buildStepInputs({ id: "n3", kind: "data-write" }, 2)).toEqual([])
  })

  it("task 节点不需要输入", () => {
    expect(buildStepInputs({ id: "n4", kind: "task" }, 3)).toEqual([])
  })
})
