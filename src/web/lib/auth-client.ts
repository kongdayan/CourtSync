import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
  baseURL: window.location.origin,
});

const popupAuthClient = createAuthClient({
  baseURL: window.location.origin,
  disableDefaultFetchPlugins: true,
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
      "about:blank",
      "courtsync-oauth",
      `width=${width},height=${height},left=${left},top=${top}`,
    );

    if (!popup) {
      reject(new Error("弹窗被浏览器拦截，请允许弹窗后重试"));
      return;
    }

    popup.focus?.();

    let settled = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearInterval(timer);
      clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      if (!popup.closed) {
        popup.close();
      }
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === "courtsync:oauth-complete") {
        finish();
      }
    };

    window.addEventListener("message", onMessage);

    const timer = setInterval(() => {
      if (popup.closed) {
        finish();
      }
    }, 500);

    const timeout = setTimeout(() => {
      finish(new Error("登录超时"));
    }, 300_000);

    popupAuthClient.signIn.social(
      {
        provider: "google",
        callbackURL: `/auth/popup-complete?next=${encodeURIComponent(callbackUrl)}`,
      },
      {
        disableSignal: true,
        onSuccess(context) {
          if (context.data?.redirect && context.data?.url) {
            popup.location.href = context.data.url;
            return;
          }
          finish();
        },
        onError(context) {
          finish(new Error(context.error.message || "登录失败"));
        },
      },
    ).catch((error: unknown) => {
      finish(error instanceof Error ? error : new Error(String(error)));
    });
  });
}
