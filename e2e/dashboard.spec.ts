import { test, expect } from "@playwright/test";
import { mockApi, mockSlotsResponse, mockMeResponse, expectNoHorizontalOverflow } from "./fixtures/api-mocks";

test.describe("dashboard", () => {
  test("shows both business source names", async ({ page }) => {
    await mockApi(page, "/slots*", mockSlotsResponse());
    await page.goto("/");
    await expect(page.getByText("香港科技大学")).toBeVisible();
    await expect(page.getByText("上海万体汇羽毛球馆")).toBeVisible();
  });

  test("has no horizontal overflow on desktop", async ({ page }) => {
    await mockApi(page, "/slots*", mockSlotsResponse());
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
  });

  test("has no horizontal overflow on mobile", async ({ page }) => {
    await mockApi(page, "/slots*", mockSlotsResponse());
    await page.goto("/");
    await expectNoHorizontalOverflow(page);
  });

  test("shows slot count and update time", async ({ page }) => {
    await mockApi(page, "/slots*", mockSlotsResponse());
    await page.goto("/");
    await expect(page.getByText(/共 3 个空闲时段/)).toBeVisible();
  });
});
