import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { RulesPage } from "../../src/web/features/rules/RulesPage";

vi.mock("../../src/web/lib/api", () => ({
  apiFetch: vi.fn(),
}));

describe("RulesPage", () => {
  it("shows consistent navigation for configuring notification rules", async () => {
    const { apiFetch } = await import("../../src/web/lib/api");
    vi.mocked(apiFetch)
      .mockResolvedValueOnce({
        user: { id: "1", email: "test@example.com", name: "Test User" },
        access: { role: "user", status: "active", ruleLimit: 3 },
      })
      .mockResolvedValueOnce([]);

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    const router = createMemoryRouter(
      [{ path: "/rules", element: <RulesPage /> }],
      { initialEntries: ["/rules"] },
    );

    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("已使用 0 / 3")).toBeInTheDocument();
    });

    expect(screen.getByRole("link", { name: "返回首页" })).toHaveAttribute(
      "href",
      "/",
    );
    expect(screen.getByRole("link", { name: "推送设置" })).toHaveAttribute(
      "href",
      "/settings/notifications",
    );
    expect(screen.getByRole("link", { name: "新建规则" })).toHaveAttribute(
      "href",
      "/rules/new",
    );
  });
});
