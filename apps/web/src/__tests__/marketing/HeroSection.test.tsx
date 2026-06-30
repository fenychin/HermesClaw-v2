/**
 * HeroSection 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import { HeroSection } from "@/components/marketing/HeroSection"

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

describe("HeroSection", () => {
  it("renders without crashing", () => {
    render(<HeroSection />)
    expect(screen.getByTestId("hero-section")).toBeInTheDocument()
  })

  it("primary CTA href is '#cta'", () => {
    render(<HeroSection />)
    const primaryCta = screen.getByTestId("hero-cta-primary")
    expect(primaryCta).toHaveAttribute("href", "#cta")
  })

  it("secondary CTA href is '#architecture'", () => {
    render(<HeroSection />)
    const secondaryCta = screen.getByTestId("hero-cta-secondary")
    expect(secondaryCta).toHaveAttribute("href", "#architecture")
  })

  it("hero-flow element exists", () => {
    render(<HeroSection />)
    expect(screen.getByTestId("hero-flow")).toBeInTheDocument()
  })

  it("displays headline text '你的企业不缺 AI'", () => {
    render(<HeroSection />)
    expect(
      screen.getByText((content) => content.includes("你的企业不缺 AI")),
    ).toBeInTheDocument()
  })

  it("renders badge with version info", () => {
    render(<HeroSection />)
    expect(screen.getByTestId("hero-badge")).toBeInTheDocument()
  })

  it("renders trust bar", () => {
    render(<HeroSection />)
    expect(screen.getByTestId("hero-trust")).toBeInTheDocument()
  })
})
