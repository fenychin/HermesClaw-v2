/**
 * IndustryPackSection 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { IndustryPackSection } from "@/components/marketing/IndustryPackSection"

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

describe("IndustryPackSection", () => {
  it("renders all 4 industry tabs", () => {
    render(<IndustryPackSection />)
    expect(screen.getByTestId("industry-tab-foreign-trade")).toBeInTheDocument()
    expect(screen.getByTestId("industry-tab-medical")).toBeInTheDocument()
    expect(screen.getByTestId("industry-tab-education")).toBeInTheDocument()
    expect(screen.getByTestId("industry-tab-finance")).toBeInTheDocument()
  })

  it("shows pack detail panel", () => {
    render(<IndustryPackSection />)
    expect(screen.getByTestId("industry-pack-detail")).toBeInTheDocument()
  })

  it("default tab shows foreign-trade content", () => {
    render(<IndustryPackSection />)
    expect(screen.getByText("询盘跟进员")).toBeInTheDocument()
  })

  it("switching to medical tab renders medical content", async () => {
    render(<IndustryPackSection />)
    const user = userEvent.setup()
    await user.click(screen.getByTestId("industry-tab-medical"))

    expect(screen.getByText("预约管理员")).toBeInTheDocument()
    expect(screen.getByText("HIS 系统")).toBeInTheDocument()
  })

  it("renders 'Industry Pack 不会侵入' note", () => {
    render(<IndustryPackSection />)
    expect(
      screen.getByText((c) => c.includes("不会侵入 Hermes / OpenClaw 核心")),
    ).toBeInTheDocument()
  })
})
