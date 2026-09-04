import { test, expect } from "@playwright/test";
import { mockApi, mockSlotsResponse, mockMeResponse, expectNoHorizontalOverflow } from "./fixtures/api-mocks";

test.describe("dashboard", () => {
  test("shows source switcher with business names", async ({ page }) => {
    await mockApi(page, "/slots*", mockSlotsResponse());
    await mockApi(page, "/me", mockMeResponse());
    await page.goto("/");
    // The meta bar shows the business name of the active source (default USThing).
    await expect(page.getByText("香港科技大学")).toBeVisible();
    // Switch to Jiushi — the mock answers any source, and the dashboard then
    // shows the Jiushi business name.
    await page.getByRole("button", { name: "Jiushi" }).click();
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
    await expect(page.getByText(/共 3 条/)).toBeVisible();
    await expect(page.getByText(/\(UTC\+8\)/)).toBeVisible();
  });
});
