import { test, expect } from "@playwright/test";
import { mockApi, mockSlotsResponse, mockMeResponse, expectNoHorizontalOverflow, expectControlsInsideViewport } from "./fixtures/api-mocks";

test.describe("seven-day planner", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page, "/slots*", mockSlotsResponse());
    await mockApi(page, "/me", mockMeResponse());
  });
  test("opens all seven dates together and honors the source URL and saved preference", async ({ page }) => {
    await page.goto("/?source=usthing");
    await expect(page.getByRole("button", { name: "港科大", exact: true })).toHaveAttribute("aria-pressed", "true");
    const table = page.getByRole("table", { name: "未来七天场地可用情况" });
    await expect(table.locator("thead th")).toHaveCount(8);
    await expect(page.getByRole("button", { name: /Next|Prev/ })).toHaveCount(0);
    await page.getByRole("button", { name: "久事体育", exact: true }).click();
    await expect(page).toHaveURL(/source=jiushi/);
    await page.goto("/");
    await expect(page.getByRole("button", { name: "久事体育", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(table.locator("thead th")).toHaveCount(8);
  });
  test("opens court details, checks continuous two hours and downloads PNG", async ({ page }) => {
    await page.goto("/");
    const cell = page.getByRole("button", { name: /18:00 至 19:00，1 块场地可用/ });
    await cell.click();
    const detail = page.locator(".slot-detail");
    await expect(detail.getByText("羽毛球 1", { exact: true })).toBeVisible();
    await expect(detail.getByText("前往小程序预约")).toBeVisible();
    await page.getByRole("combobox", { name: "连续预约时长" }).selectOption("2");
    await expect(page.getByRole("button", { name: /18:00 至 20:00，无可用场地/ })).toBeVisible();
    await expect(page.getByText("已筛选同一块场地连续空闲 2 小时的时段。", { exact: false })).toBeVisible();
    const download = page.waitForEvent("download");
    await page.getByRole("button", { name: "下载当前场次图片" }).click();
    expect((await download).suggestedFilename()).toMatch(/courtsync-jiushi-.*\.png/);
  });
  test("keeps controls and seven columns inside narrow screens in both themes", async ({ page }) => {
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 1000 }); await page.goto("/");
      await expect(page.getByRole("table")).toBeVisible();
      await expectNoHorizontalOverflow(page); await expectControlsInsideViewport(page);
      await page.getByRole("button", { name: "切换夜间模式" }).click();
      await expectNoHorizontalOverflow(page);
      await page.getByRole("button", { name: "切换白天模式" }).click();
    }
  });
  test("distinguishes source outages from booked courts and preserves the week", async ({ page }) => {
    await mockApi(page, "/slots*", mockSlotsResponse({ slots: [], count: 0, sourceState: "unavailable", lastSyncedAt: null }));
    await page.goto("/?source=usthing");
    await expect(page.getByText("该数据源暂不可用，暂无采集数据。")).toBeVisible();
    await expect(page.getByRole("table").locator("thead th")).toHaveCount(8);
    await expect(page.getByRole("button", { name: /暂无数据/ }).first()).toBeVisible();
  });
  test("checks every five minutes and pauses automatic requests while hidden", async ({ page }) => {
    let requests = 0;
    await page.clock.install();
    await page.route("**/api/slots*", async route => { requests++; await route.fulfill({ json: mockSlotsResponse() }); });
    await page.goto("/");
    await expect(page.getByRole("button", { name: /刷新|检查中/ })).toBeEnabled();
    const initial = requests;
    await page.clock.fastForward(300_001);
    await expect.poll(() => requests).toBe(initial + 1);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); });
    const beforeHidden = requests;
    await page.clock.fastForward(600_001);
    expect(requests).toBe(beforeHidden);
    await page.evaluate(() => { Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange", { bubbles: true })); });
    await expect.poll(() => requests).toBe(beforeHidden + 1);
  });
  test("does not requery when filters or a fresh page focus change", async ({ page }) => {
    let requests = 0;
    await page.route("**/api/slots*", async route => { requests++; await route.fulfill({ json: mockSlotsResponse() }); });
    await page.goto("/");
    await expect(page.getByRole("button", { name: "刷新", exact: true })).toBeEnabled();
    const initial = requests;
    await page.getByRole("combobox", { name: "时段筛选" }).selectOption("evening");
    await page.getByRole("combobox", { name: "连续预约时长" }).selectOption("2");
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
    expect(requests).toBe(initial);
  });
});
