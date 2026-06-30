/**
 * ArchitectureSection 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { ArchitectureSection } from "@/components/marketing/ArchitectureSection"

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

describe("ArchitectureSection", () => {
  it("renders all three domain layers", () => {
    render(<ArchitectureSection />)
    expect(screen.getByTestId("arch-layer-hermes")).toBeInTheDocument()
    expect(screen.getByTestId("arch-layer-openclaw")).toBeInTheDocument()
    expect(screen.getByTestId("arch-layer-industry")).toBeInTheDocument()
  })

  it("renders arch-loop section", () => {
    render(<ArchitectureSection />)
    expect(screen.getByTestId("arch-loop")).toBeInTheDocument()
  })

  it("displays 'TaskEnvelope' text", () => {
    render(<ArchitectureSection />)
    expect(screen.getByText("TaskEnvelope")).toBeInTheDocument()
  })

  it("renders full domain card titles", () => {
    render(<ArchitectureSection />)
    expect(screen.getByText("Hermes Control Kernel")).toBeInTheDocument()
    expect(screen.getByText("OpenClaw Execution Runtime")).toBeInTheDocument()
    expect(screen.getByText("Industry Pack Layer")).toBeInTheDocument()
  })
})
