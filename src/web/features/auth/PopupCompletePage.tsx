import { useEffect } from "react";

export function PopupCompletePage() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const next = params.get("next") || "/account";

    if (window.opener) {
      window.opener.postMessage(
        { type: "courtsync:oauth-complete" },
        window.location.origin,
      );
      window.close();
      return;
    }

    window.location.replace(next);
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <p className="text-muted-foreground">登录完成，正在返回 CourtSync...</p>
    </div>
  );
}
