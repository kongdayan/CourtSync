import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { DashboardPage } from "../../src/web/features/dashboard/DashboardPage";
vi.mock("../../src/web/lib/api", () => ({ apiFetch: vi.fn() }));

describe("public dashboard", () => {
  it("keeps promotion links and hides login and reminders without loading a session", async () => {
    const { apiFetch } = await import("../../src/web/lib/api");
    vi.mocked(apiFetch).mockResolvedValue({ slots: [], count: 0, warnings: [], sourceState: "unavailable" });
    const router = createMemoryRouter([{ path: "/", element: <DashboardPage /> }], { initialEntries: ["/"] });
    render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><RouterProvider router={router} /></QueryClientProvider>);
    await waitFor(() => expect(apiFetch).toHaveBeenCalled());
    expect(vi.mocked(apiFetch).mock.calls.every(([path]) => path.startsWith("/slots?"))).toBe(true);
    expect(screen.queryByRole("link", { name: /登录|有场时提醒我/ })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /@Kook91513056/ })).toHaveAttribute("href", "https://x.com/Kook91513056");
    expect(screen.getByRole("link", { name: /@kongdayan/ })).toHaveAttribute("href", "https://github.com/kongdayan");
  });
});
