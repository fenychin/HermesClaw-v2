/**
 * E2E 测试：营销落地页
 * 运行方式：npx playwright test tests/e2e/marketing.spec.ts
 *
 * 前置条件：
 * 1. 安装 playwright：npx playwright install chromium
 * 2. 启动开发服务器：pnpm --filter web dev
 * 3. 设置 BASE_URL 环境变量或使用默认 http://localhost:3000
 */
import { test, expect } from "@playwright/test"

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000"

test.describe("HermesClaw Marketing Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL)
  })

  test("1. page title contains HermesClaw", async ({ page }) => {
    await expect(page).toHaveTitle(/HermesClaw/)
  })

  test("2. marketing-nav visible", async ({ page }) => {
    const nav = page.getByTestId("marketing-nav")
    await expect(nav).toBeVisible()
  })

  test("3. hero-section + hero-cta-primary visible", async ({ page }) => {
    const hero = page.getByTestId("hero-section")
    await expect(hero).toBeVisible()

    const cta = page.getByTestId("hero-cta-primary")
    await expect(cta).toBeVisible()
  })

  test("4. clicking hero-cta-primary scrolls to cta-section", async ({ page }) => {
    const cta = page.getByTestId("hero-cta-primary")
    await cta.click()

    await page.waitForTimeout(600) // scroll animation

    // CTA section should be in viewport
    const ctaSection = page.getByTestId("cta-section")
    await expect(ctaSection).toBeVisible()
  })

  test("5. all 5 problem cards visible", async ({ page }) => {
    const cardIds = [
      "no-loop",
      "no-memory",
      "no-template",
      "no-governance",
      "no-evolution",
    ]

    // Scroll to problem section first
    const section = page.getByTestId("problem-section")
    await section.scrollIntoViewIfNeeded()

    for (const id of cardIds) {
      const card = page.getByTestId(`problem-card-${id}`)
      await expect(card).toBeVisible()
    }
  })

  test("6. all 3 architecture domain layers visible", async ({ page }) => {
    const archSection = page.getByTestId("architecture-section")
    await archSection.scrollIntoViewIfNeeded()

    await expect(page.getByTestId("arch-layer-hermes")).toBeVisible()
    await expect(page.getByTestId("arch-layer-openclaw")).toBeVisible()
    await expect(page.getByTestId("arch-layer-industry")).toBeVisible()
  })

  test("7. industry tab switching works", async ({ page }) => {
    const section = page.getByTestId("industry-pack-section")
    await section.scrollIntoViewIfNeeded()

    // Click medical tab
    await page.getByTestId("industry-tab-medical").click()
    await page.waitForTimeout(200)

    // Should show medical content
    await expect(page.getByText("HIS系统")).toBeVisible()
  })

  test("8. governance level L4 click shows '全自动'", async ({ page }) => {
    const section = page.getByTestId("governance-section")
    await section.scrollIntoViewIfNeeded()

    await page.getByTestId("level-btn-L4").click()
    await page.waitForTimeout(200)

    await expect(page.getByText("全自动")).toBeVisible()
  })

  test("9. CTA form submit with mocked 201 shows success", async ({ page }) => {
    // Mock the API response
    await page.route("**/api/marketing/early-access", (route) => {
      route.fulfill({
        status: 201,
        contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      })
    })

    const ctaSection = page.getByTestId("cta-section")
    await ctaSection.scrollIntoViewIfNeeded()

    await page.getByTestId("cta-email-input").fill("test@company.com")
    await page.getByTestId("cta-submit-btn").click()

    await expect(page.getByTestId("cta-success")).toBeVisible({ timeout: 5000 })
  })

  test("10. CTA form submit with mocked 500 shows error", async ({ page }) => {
    await page.route("**/api/marketing/early-access", (route) => {
      route.fulfill({
        status: 500,
        contentType: "application/json",
        body: JSON.stringify({ error: "服务器内部错误" }),
      })
    })

    const ctaSection = page.getByTestId("cta-section")
    await ctaSection.scrollIntoViewIfNeeded()

    await page.getByTestId("cta-email-input").fill("test@company.com")
    await page.getByTestId("cta-submit-btn").click()

    await expect(page.getByTestId("cta-error")).toBeVisible({ timeout: 5000 })
  })

  test("11. footer visible after scroll to bottom", async ({ page }) => {
    const footer = page.getByTestId("marketing-footer")
    await footer.scrollIntoViewIfNeeded()

    await expect(footer).toBeVisible()
  })
})
