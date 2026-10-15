import { test, expect } from "@playwright/test";
import fs from "node:fs/promises";
import { mockApi, mockSlotsResponse, expectNoHorizontalOverflow, expectControlsInsideViewport } from "./fixtures/api-mocks";

test.beforeEach(async ({ page }) => { await mockApi(page, "/slots*", mockSlotsResponse()); });

test("restores exact promotion accounts and keeps login/reminders hidden", async ({ page }) => {
  const meRequests: string[] = []; page.on("request", r => { if (r.url().endsWith("/api/me")) meRequests.push(r.url()); });
  await page.goto("/");
  await expect(page.getByRole("link", { name: /@Kook91513056/ })).toHaveAttribute("href", "https://x.com/Kook91513056");
  await expect(page.getByRole("link", { name: /@kongdayan/ })).toHaveAttribute("href", "https://github.com/kongdayan");
  await expect(page.getByRole("link", { name: /登录|有场时提醒我/ })).toHaveCount(0);
  expect(meRequests).toEqual([]);
});

test("offers 1–6 hours and preserves language and theme across reloads", async ({ page }) => {
  await page.goto("/");
  const duration = page.getByRole("combobox", { name: "连续预约时长" });
  await expect(duration.locator("option")).toHaveCount(6);
  await duration.selectOption("6");
  await expect(page.getByText("已筛选同一块场地连续空闲 6 小时的时段。", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Switch to English" }).click();
  await expect(page.getByRole("heading", { name: "Seven days. One view." })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Continuous booking duration" })).toHaveValue("6");
  await page.getByRole("button", { name: "Switch to night mode" }).click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Seven days. One view." })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await page.getByRole("button", { name: "Switch to day mode" }).click();
  await expect(page.locator("html")).not.toHaveClass(/dark/);
  await page.getByRole("button", { name: "切换为中文" }).click();
  await expect(page.getByRole("heading", { name: "未来七天，一眼看全。" })).toBeVisible();
});

test("keeps English controls inside all screen sizes", async ({ page }) => {
  await page.goto("/"); await page.getByRole("button", { name: "Switch to English" }).click();
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await expectNoHorizontalOverflow(page); await expectControlsInsideViewport(page);
    await expect(page.getByRole("table").locator("thead th")).toHaveCount(8);
  }
});

test("downloads the filtered rendered schedule as a nonempty PNG in both languages and themes", async ({ page }, testInfo) => {
  await page.goto("/");
  await page.getByRole("combobox", { name: "时段筛选" }).selectOption("evening");
  await page.getByRole("checkbox", { name: "显示场地号" }).check();
  await page.getByRole("button", { name: /18:00 至 19:00，1 块场地可用/ }).click();
  for (const language of ["zh", "en"] as const) {
    if (language === "en") { await page.getByRole("button", { name: "Switch to English" }).click(); await page.getByRole("button", { name: "Switch to night mode" }).click(); }
    const downloadButton = page.getByRole("button", { name: language === "zh" ? "下载当前场次图片" : "Download current schedule image" });
    const started = page.waitForEvent("download"); await downloadButton.click(); const download = await started;
    expect(download.suggestedFilename()).toMatch(new RegExp("courtsync-jiushi-.*-1h-" + language + "\\.png"));
    const imagePath = testInfo.outputPath("schedule-" + language + ".png"); await download.saveAs(imagePath);
    const bytes = await fs.readFile(imagePath);
    expect(bytes.subarray(0, 8)).toEqual(Buffer.from([137,80,78,71,13,10,26,10]));
    expect(bytes.readUInt32BE(16)).toBeGreaterThan(600); expect(bytes.readUInt32BE(20)).toBeGreaterThan(500);
    expect(bytes.length).toBeGreaterThan(20_000);
    const dataUrl = "data:image/png;base64," + bytes.toString("base64");
    const diverse = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const canvas = document.createElement("canvas"); canvas.width = 120; canvas.height = 120;
      const context = canvas.getContext("2d")!; context.drawImage(img, 0, 0, 120, 120);
      const pixels = context.getImageData(0, 0, 120, 120).data; const colors = new Set<string>();
      for (let i = 0; i < pixels.length; i += 4) colors.add([pixels[i], pixels[i + 1], pixels[i + 2], pixels[i + 3]].join(","));
      return colors.size;
    }, dataUrl);
    expect(diverse).toBeGreaterThan(100);
    await expect(downloadButton).toBeEnabled();
  }
});

test("opens and hides a mobile sheet without shrinking the week board", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto("/");
  await expect(page.locator(".slot-detail")).toHaveCount(0);
  const board = page.locator(".week-board");
  const before = await board.boundingBox();
  await page.getByRole("button", { name: /18:00 至 19:00，1 块场地可用/ }).click();
  await expect(page.getByRole("dialog", { name: "时段详情" })).toBeVisible();
  const after = await board.boundingBox(); expect(after!.width).toBe(before!.width);
  expect(await page.locator(".slot-detail").evaluate(el => getComputedStyle(el).position)).toBe("fixed");
  const panel = await page.locator(".slot-detail").boundingBox();
  expect(844 - panel!.y - panel!.height).toBeGreaterThanOrEqual(32);
  await page.locator(".detail-panel-body").evaluate(el => { el.scrollTop = el.scrollHeight; });
  await expect(page.getByRole("button", { name: "返回时段筛选", exact: true })).toBeInViewport();
  await expect(page.getByRole("button", { name: "返回七天总览", exact: true })).toBeInViewport();
  await page.getByRole("button", { name: "返回七天总览", exact: true }).click();
  await expect(page.locator(".slot-detail")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "查看详情", exact: true })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("finds matching weekdays, time windows and durations, then returns without losing filters", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const base = mockSlotsResponse();
  const date = base.slots[0].Date;
  await mockApi(page, "/slots*", { ...base, slots: [8, 9, 10, 18, 19, 20].map(hour => ({ ...base.slots[0], StartTime: String(hour).padStart(2, "0") + ":00", EndTime: String(hour + 1).padStart(2, "0") + ":00" })) });
  let requests = 0; page.on("request", request => { if (request.url().includes("/api/slots")) requests++; });
  await page.goto("/");
  await page.getByRole("button", { name: "找合适的时段", exact: true }).click();
  await page.getByRole("combobox", { name: "常用时间段", exact: true }).selectOption("eveningShort");
  await page.getByRole("combobox", { name: "查找连续时长", exact: true }).selectOption("2");
  await page.getByRole("combobox", { name: "最早开始", exact: true }).selectOption("18:00");
  await page.getByRole("combobox", { name: "最晚结束", exact: true }).selectOption("20:00");
  const options = page.locator(".finder-day-options input");
  const labels = await options.evaluateAll(nodes => nodes.map(node => node.getAttribute("aria-label")));
  const chosenDate = date.slice(5).replace("-", "/");
  for (const label of labels) if (!label!.endsWith(chosenDate)) await page.getByRole("checkbox", { name: label!, exact: true }).uncheck();
  await expect(page.locator(".slot-match")).toHaveCount(1);
  await expect(page.locator(".slot-match")).toContainText("18:00–20:00");
  await expect(page.locator(".slot-match")).toContainText("羽毛球 1");
  await page.getByRole("button", { name: "查看 1 个时段", exact: true }).click();
  await expect(page.locator(".slot-match")).toBeInViewport();
  await page.locator(".slot-match").click();
  await expect(page.locator(".detail-time")).toHaveText("18:00—20:00");
  await page.getByRole("button", { name: "返回时段筛选", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "最晚结束", exact: true })).toHaveValue("20:00");
  await expect(page.getByRole("combobox", { name: "查找连续时长", exact: true })).toHaveValue("2");
  await expect(page.locator(".slot-match")).toHaveCount(1);
  await page.getByRole("combobox", { name: "最早开始", exact: true }).selectOption("20:30");
  await expect(page.getByText("最晚结束时间需要晚于最早开始时间。", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "返回七天总览", exact: true }).click();
  await page.getByRole("button", { name: "找合适的时段", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "最早开始", exact: true })).toHaveValue("20:30");
  expect(requests).toBe(1);
  await expectNoHorizontalOverflow(page);
});

test("collapses the desktop sidebar and reopens the selected time", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto("/");
  await page.getByRole("button", { name: "收起详情", exact: true }).click();
  await expect(page.locator(".slot-detail")).toHaveCount(0);
  await page.getByRole("button", { name: /18:00 至 19:00，1 块场地可用/ }).click();
  await expect(page.getByRole("complementary", { name: "时段详情" })).toBeVisible();
  await expect(page.getByRole("button", { name: "收起详情", exact: true })).toHaveAttribute("aria-expanded", "true");
});

test("ships legacy-compatible responsive CSS for WeChat WebView", async ({ page }) => {
  await page.goto("/");
  const stylesheets = await page.locator('link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => (node as HTMLLinkElement).href));
  for (const url of stylesheets) {
    const css = await (await page.request.get(url)).text();
    expect(css).not.toMatch(/@media[^{}]*\(\s*width\s*[<>]=/);
  }
  await page.setViewportSize({ width: 375, height: 812 });
  const layout = await page.locator(".planner-content").evaluate(el => ({ columns: getComputedStyle(el).gridTemplateColumns, compact: el.classList.contains("compact-layout") }));
  expect(layout.compact).toBe(true); await expectNoHorizontalOverflow(page);
});
