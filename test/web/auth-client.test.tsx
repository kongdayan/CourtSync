import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signInSocial = vi.fn();

vi.mock("better-auth/client", () => ({
  createAuthClient: vi.fn(() => ({
    signIn: {
      social: signInSocial,
    },
  })),
}));

describe("signInWithGooglePopup", () => {
  const originalOpen = window.open;
  const originalLocation = window.location;
  const originalFetch = window.fetch;
  const locationAssign = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    signInSocial.mockReset();
    locationAssign.mockReset();
    window.fetch = originalFetch;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        origin: originalLocation.origin,
        assign: locationAssign,
      },
    });
  });

  afterEach(() => {
    window.open = originalOpen;
    window.fetch = originalFetch;
    vi.useRealTimers();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  it("uses Better Auth's social sign-in flow and opens the provider URL in a popup", async () => {
    const popup = {
      closed: false,
      location: { href: "" },
      close: vi.fn(),
      focus: vi.fn(),
    } as unknown as Window;
    window.open = vi.fn(() => popup);
    signInSocial.mockImplementation(async (_body, options) => {
      await options.onSuccess({
        data: {
          redirect: true,
          url: "https://accounts.google.com/o/oauth2/v2/auth",
        },
      });
    });

    const { signInWithGooglePopup } = await import("../../src/web/lib/auth-client");
    const promise = signInWithGooglePopup("/account");
    window.dispatchEvent(new MessageEvent("message", {
      origin: window.location.origin,
      data: { type: "courtsync:oauth-complete" },
    }));
    await promise;

    expect(signInSocial).toHaveBeenCalledWith(
      {
        provider: "google",
        callbackURL: "/auth/popup-complete?next=%2Faccount",
      },
      expect.objectContaining({ disableSignal: true }),
    );
    expect(window.open).toHaveBeenCalledWith(
      "about:blank",
      "courtsync-oauth",
      expect.stringContaining("width=500"),
    );
    expect(popup.location.href).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(popup.close).toHaveBeenCalled();
    expect(locationAssign).toHaveBeenCalledWith("/account");
  });

  it("navigates after the popup closes when a session was created", async () => {
    vi.useFakeTimers();
    const popup = {
      closed: false,
      location: { href: "" },
      close: vi.fn(),
      focus: vi.fn(),
    } as unknown as Window;
    window.open = vi.fn(() => popup);
    window.fetch = vi.fn(async () => new Response("{}", { status: 200 })) as typeof fetch;
    signInSocial.mockImplementation(async (_body, options) => {
      await options.onSuccess({
        data: {
          redirect: true,
          url: "https://accounts.google.com/o/oauth2/v2/auth",
        },
      });
    });

    const { signInWithGooglePopup } = await import("../../src/web/lib/auth-client");
    const promise = signInWithGooglePopup("/account");
    (popup as unknown as { closed: boolean }).closed = true;
    await vi.advanceTimersByTimeAsync(500);
    await promise;

    expect(window.fetch).toHaveBeenCalledWith("/api/me", { credentials: "include" });
    expect(locationAssign).toHaveBeenCalledWith("/account");
  });
});
