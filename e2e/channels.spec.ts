import { test, expect } from "@playwright/test";
import { mockApi, mockMeResponse } from "./fixtures/api-mocks";

test.describe("channels", () => {
  test("shows empty state when no channel", async ({ page }) => {
    await mockApi(page, "/me", mockMeResponse());
    await mockApi(page, "/channels", []);
    await page.goto("/settings/notifications");
    // Empty state: page header + key-input form are visible.
    await expect(
      page.getByRole("heading", { name: "推送设置" }),
    ).toBeVisible();
    await expect(page.getByPlaceholder("输入 PushDeer Key")).toBeVisible();
  });
});
