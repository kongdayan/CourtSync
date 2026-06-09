import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});

export function signInWithGooglePopup(
  callbackUrl = "/account",
): Promise<void> {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 650;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const popup = window.open(
      `/api/auth/sign-in/social?provider=google&callbackURL=${encodeURIComponent(callbackUrl)}`,
      "oauth-popup",
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      reject(new Error("弹窗被浏览器拦截，请允许弹窗后重试"));
      return;
    }

    const timer = setInterval(() => {
      if (popup.closed) {
        clearInterval(timer);
        resolve();
      }
    }, 500);

    // Timeout after 5 minutes
    setTimeout(() => {
      clearInterval(timer);
      if (!popup.closed) popup.close();
      reject(new Error("登录超时"));
    }, 300_000);
  });
}
