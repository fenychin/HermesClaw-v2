/**
 * GovernanceSection 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { GovernanceSection } from "@/components/marketing/GovernanceSection"

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

describe("GovernanceSection", () => {
  it("renders automation level controller", () => {
    render(<GovernanceSection />)
    expect(
      screen.getByTestId("automation-level-controller"),
    ).toBeInTheDocument()
  })

  it("renders audit log timeline", () => {
    render(<GovernanceSection />)
    expect(screen.getByTestId("audit-log-timeline")).toBeInTheDocument()
  })

  it("all 4 level buttons present", () => {
    render(<GovernanceSection />)
    expect(screen.getByTestId("level-btn-L1")).toBeInTheDocument()
    expect(screen.getByTestId("level-btn-L2")).toBeInTheDocument()
    expect(screen.getByTestId("level-btn-L3")).toBeInTheDocument()
    expect(screen.getByTestId("level-btn-L4")).toBeInTheDocument()
  })

  it("clicking L4 button renders '全自动' content", async () => {
    render(<GovernanceSection />)
    const user = userEvent.setup()
    await user.click(screen.getByTestId("level-btn-L4"))

    // After clicking L4, the level detail should update with L4 info
    const detail = screen.getByTestId("level-detail")
    expect(detail).toHaveTextContent("全自动")
  })

  it("renders audit log entries", () => {
    render(<GovernanceSection />)
    expect(screen.getByText("TaskEnvelope 创建")).toBeInTheDocument()
    expect(screen.getByText("AuditLog 记录")).toBeInTheDocument()
  })

  it("renders Demo data note in audit timeline", () => {
    render(<GovernanceSection />)
    expect(
      screen.getByText((content) => content.includes("auditTraceId")),
    ).toBeInTheDocument()
  })
})
