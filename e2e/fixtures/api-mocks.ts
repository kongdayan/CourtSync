import { expect, type Page } from "@playwright/test";

export async function mockApi(page: Page, path: string, response: unknown) {
  await page.route(`**/api${path}`, async (route) => {
    await route.fulfill({ json: response });
  });
}

export function mockSlotsResponse(overrides = {}) {
  return {
    source: "usthing",
    sourceName: "香港科技大学",
    count: 3,
    startDate: "2026-06-09",
    endDate: "2026-06-23",
    lastUpdatedAt: new Date().toISOString(),
    warnings: [],
    slots: [
      { Date: "2026-06-10", StartTime: "18:00", EndTime: "19:00", FacilityID: "2", Status: "Available" },
      { Date: "2026-06-10", StartTime: "19:00", EndTime: "20:00", FacilityID: "3", Status: "Available" },
      { Date: "2026-06-10", StartTime: "20:00", EndTime: "21:00", FacilityID: "5", Status: "Available" },
    ],
    availableSources: [
      { key: "usthing", name: "香港科技大学" },
      { key: "jiushi", name: "上海万体汇羽毛球馆" },
    ],
    ...overrides,
  };
}

export function mockMeResponse(overrides = {}) {
  return {
    user: { id: "u1", email: "test@example.com", name: "Test User", image: null },
    access: { role: "user", status: "active", ruleLimit: 5 },
    ...overrides,
  };
}

export async function expectNoHorizontalOverflow(page: Page) {
  const dimensions = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
}

export async function expectControlsInsideViewport(page: Page) {
  const failures = await page.locator("button, input, select, [role=checkbox], [role=radio]").evaluateAll((nodes) =>
    nodes.flatMap((node) => {
      const rect = node.getBoundingClientRect();
      return rect.left < -1 || rect.right > window.innerWidth + 1
        ? [node.getAttribute("aria-label") ?? node.textContent ?? node.tagName]
        : [];
    }),
  );
  expect(failures).toEqual([]);
}
