import { test, expect } from "@playwright/test";
import { mockApi, mockMeResponse } from "./fixtures/api-mocks";

test.describe("rules", () => {
  test("shows usage counter", async ({ page }) => {
    await mockApi(page, "/me", mockMeResponse({ access: { role: "user", status: "active", ruleLimit: 5 } }));
    await mockApi(page, "/rules", []);
    await mockApi(page, "/rule-options", { sources: [], facilities: {}, weekdays: [], timeslots: [], pushLimitOptions: [] });
    await page.goto("/rules");
    await expect(page.getByText(/已使用 0 \/ 5/)).toBeVisible();
  });
});
