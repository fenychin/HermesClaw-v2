/**
 * CTASection 组件单元测试
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { CTASection } from "@/components/marketing/CTASection"

describe("CTASection", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("renders email input and submit button", () => {
    render(<CTASection />)
    expect(screen.getByTestId("cta-email-input")).toBeInTheDocument()
    expect(screen.getByTestId("cta-submit-btn")).toBeInTheDocument()
  })

  it("submit button has correct text", () => {
    render(<CTASection />)
    expect(screen.getByTestId("cta-submit-btn")).toHaveTextContent("申请内测 →")
  })

  it("email input has correct placeholder", () => {
    render(<CTASection />)
    const input = screen.getByTestId("cta-email-input")
    expect(input).toHaveAttribute("placeholder", "输入企业邮箱")
  })

  it("stats bar renders all 4 stats with amber values", () => {
    render(<CTASection />)
    expect(screen.getByText("4+")).toBeInTheDocument()
    expect(screen.getByText("20+")).toBeInTheDocument()
    expect(screen.getByText("100%")).toBeInTheDocument()
    expect(screen.getByText("V2.20")).toBeInTheDocument()
  })

  it("successful fetch shows cta-success element", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: true,
      status: 201,
      json: async () => ({ ok: true }),
    } as Response)

    render(<CTASection />)
    const user = userEvent.setup()

    await user.type(
      screen.getByTestId("cta-email-input"),
      "test@company.com",
    )
    await user.click(screen.getByTestId("cta-submit-btn"))

    await waitFor(() => {
      expect(screen.getByTestId("cta-success")).toBeInTheDocument()
    })
  })

  it("failed fetch shows cta-error element", async () => {
    vi.spyOn(global, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "服务器错误" }),
    } as Response)

    render(<CTASection />)
    const user = userEvent.setup()

    await user.type(
      screen.getByTestId("cta-email-input"),
      "test@company.com",
    )
    await user.click(screen.getByTestId("cta-submit-btn"))

    await waitFor(() => {
      expect(screen.getByTestId("cta-error")).toBeInTheDocument()
    })
  })

  it("submit button disabled during loading", async () => {
    vi.spyOn(global, "fetch").mockImplementationOnce(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                ok: true,
                status: 201,
                json: async () => ({ ok: true }),
              } as Response),
            500,
          ),
        ),
    )

    render(<CTASection />)
    const user = userEvent.setup()

    await user.type(
      screen.getByTestId("cta-email-input"),
      "test@company.com",
    )

    const btn = screen.getByTestId("cta-submit-btn")
    await user.click(btn)

    expect(btn).toBeDisabled()
  })
})
