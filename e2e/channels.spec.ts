import { test, expect } from "@playwright/test";
import { mockApi, mockMeResponse } from "./fixtures/api-mocks";

test.describe("channels", () => {
  test("shows empty state when no channel", async ({ page }) => {
    await mockApi(page, "/me", mockMeResponse());
    await mockApi(page, "/channels", []);
    await page.goto("/settings/notifications");
    await expect(page.getByText(/PushDeer/)).toBeVisible();
  });
});
