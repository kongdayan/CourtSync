import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { DashboardPage } from "../../src/web/features/dashboard/DashboardPage";

// Mock the API
vi.mock("../../src/web/lib/api", () => ({
  apiFetch: vi.fn(),
}));

const slotsResponse = {
  source: "usthing",
  sourceName: "香港科技大学",
  count: 0,
  startDate: "2026-06-09",
  endDate: "2026-06-23",
  lastUpdatedAt: new Date().toISOString(),
  warnings: [],
  slots: [],
  availableSources: [
    { key: "usthing", name: "香港科技大学" },
    { key: "jiushi", name: "上海万体汇羽毛球馆" },
  ],
};

describe("DashboardPage", () => {
  it("shows source tabs with business names", async () => {
    const { apiFetch } = await import("../../src/web/lib/api");
    // useMe calls /me first, then the dashboard calls /slots
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        user: { id: "1", email: "test@example.com", name: "Test" },
        access: { role: "user", status: "active", ruleLimit: 2 },
      })
      .mockResolvedValueOnce(slotsResponse);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [{ path: "/", element: <DashboardPage /> }],
      { initialEntries: ["/"] }
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByText("香港科技大学")).toBeInTheDocument();
      expect(screen.getByText("上海万体汇羽毛球馆")).toBeInTheDocument();
    });
  });
});
