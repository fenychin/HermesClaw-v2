/**
 * ProblemSection 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { ProblemSection } from "@/components/marketing/ProblemSection"

beforeEach(() => {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe = vi.fn()
      unobserve = vi.fn()
      disconnect = vi.fn()
    },
  )
})

describe("ProblemSection", () => {
  it("renders without crashing", () => {
    render(<ProblemSection />)
    expect(screen.getByTestId("problem-section")).toBeInTheDocument()
  })

  it("renders all 5 problem cards", () => {
    render(<ProblemSection />)
    const cardIds = [
      "no-loop",
      "no-memory",
      "no-template",
      "no-governance",
      "no-evolution",
    ]
    for (const id of cardIds) {
      expect(screen.getByTestId(`problem-card-${id}`)).toBeInTheDocument()
    }
  })

  it("displays headline '5 个核心障碍'", () => {
    render(<ProblemSection />)
    expect(
      screen.getByText((content) => content.includes("5 个核心障碍")),
    ).toBeInTheDocument()
  })
})
