import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LoginPage } from "../../src/web/features/auth/LoginPage";

const { signInWithGooglePopup } = vi.hoisted(() => ({
  signInWithGooglePopup: vi.fn(),
}));

vi.mock("../../src/web/lib/auth-client", () => ({
  signInWithGooglePopup,
}));

describe("LoginPage", () => {
  beforeEach(() => {
    signInWithGooglePopup.mockReset();
  });

  it("starts Google sign-in in a popup", async () => {
    signInWithGooglePopup.mockResolvedValue(undefined);

    render(<LoginPage />);
    await userEvent.click(screen.getByRole("button", { name: "使用 Google 账号登录" }));

    expect(signInWithGooglePopup).toHaveBeenCalledWith("/account");
  });
});
