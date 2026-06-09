import { signInWithGooglePopup } from "../../lib/auth-client";

export function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold">CourtSync</h1>
        <p className="text-muted-foreground">登录以管理通知规则</p>
        <button
          onClick={() => void signInWithGooglePopup("/account")}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-white hover:bg-blue-700"
        >
          使用 Google 账号登录
        </button>
      </div>
    </div>
  );
}
