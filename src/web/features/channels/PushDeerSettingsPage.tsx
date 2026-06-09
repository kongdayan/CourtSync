import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, apiPost, apiPut, ApiError } from "../../lib/api";
import { useState, useCallback, useEffect } from "react";

interface ChannelInfo {
  provider: string;
  destinationMask: string;
  enabled: boolean;
  verifiedAt: string;
  lastError: string | null;
}

type PageState =
  | { status: "loading" }
  | { status: "empty" }
  | { status: "testing"; pushKey: string }
  | { status: "tested"; pushKey: string; verificationToken: string }
  | { status: "saving"; pushKey: string; verificationToken: string }
  | { status: "saved"; destinationMask: string }
  | { status: "error"; message: string };

export function PushDeerSettingsPage() {
  const queryClient = useQueryClient();

  const {
    data: channels,
    isLoading: channelsLoading,
    error: channelsError,
  } = useQuery<ChannelInfo[]>({
    queryKey: ["channels"],
    queryFn: () => apiFetch("/channels"),
    retry: false,
  });

  const existingChannel = channels?.find((c) => c.provider === "pushdeer");
  const [state, setState] = useState<PageState>({ status: "loading" });
  const [pushKeyInput, setPushKeyInput] = useState("");

  /* Initialise state once channels are loaded */
  useEffect(() => {
    if (!channelsLoading && !channelsError && channels) {
      const existing = channels.find((c) => c.provider === "pushdeer");
      if (existing && existing.destinationMask) {
        setState({ status: "saved", destinationMask: existing.destinationMask });
      } else {
        setState({ status: "empty" });
      }
    }
    if (channelsError) {
      setState({ status: "error", message: "加载通道信息失败" });
    }
  }, [channelsLoading, channelsError, channels]);

  /* When user edits the input after testing, invalidate the token */
  const handleKeyChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setPushKeyInput(value);
      setState((prev) => {
        if (prev.status === "tested" && value !== prev.pushKey) {
          return { status: "empty" };
        }
        if (prev.status === "saved") {
          return { status: "empty" };
        }
        return prev;
      });
    },
    [],
  );

  /* Test button handler */
  const handleTest = useCallback(async () => {
    if (!pushKeyInput.trim()) return;
    setState({ status: "testing", pushKey: pushKeyInput.trim() });

    try {
      const result = await apiPost<{ verificationToken: string }>(
        "/channels/pushdeer/test",
        { pushKey: pushKeyInput.trim() },
      );
      setState({
        status: "tested",
        pushKey: pushKeyInput.trim(),
        verificationToken: result.verificationToken,
      });
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? "测试推送失败" : "网络错误";
      setState({ status: "error", message });
    }
  }, [pushKeyInput]);

  /* Save button handler */
  const handleSave = useCallback(async () => {
    const currentState = state;
    if (currentState.status !== "tested") return;

    setState({
      status: "saving",
      pushKey: currentState.pushKey,
      verificationToken: currentState.verificationToken,
    });

    try {
      const result = await apiPut<{ destinationMask: string; verifiedAt: string }>(
        "/channels/pushdeer",
        {
          pushKey: currentState.pushKey,
          verificationToken: currentState.verificationToken,
        },
      );
      setState({ status: "saved", destinationMask: result.destinationMask });
      queryClient.invalidateQueries({ queryKey: ["channels"] });
    } catch (err: unknown) {
      const message =
        err instanceof ApiError ? "保存失败" : "网络错误";
      setState({ status: "error", message });
    }
  }, [state, queryClient]);

  /* ---- Render helpers ---- */
  if (state.status === "loading") {
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="mb-6 text-xl font-bold">推送设置</h1>
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  const isSaved = state.status === "saved";

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="mb-6 text-xl font-bold">推送设置</h1>

      <div className="space-y-4 rounded-lg border border-gray-200 p-6">
        {/* Description */}
        <p className="text-sm text-gray-600">
          配置 PushDeer 推送，在有可用场地时接收通知。
          需要先获取您的 PushDeer Key。
        </p>

        {/* Key input */}
        <div>
          <label htmlFor="push-key" className="mb-1 block text-sm font-medium">
            PushDeer Key
          </label>
          {isSaved ? (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600">
              {(state as { status: "saved"; destinationMask: string }).destinationMask}
            </div>
          ) : (
            <input
              id="push-key"
              type="text"
              value={pushKeyInput}
              onChange={handleKeyChange}
              placeholder="输入 PushDeer Key"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          )}
        </div>

        {/* Success message after save */}
        {isSaved && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            推送配置已保存
          </div>
        )}

        {/* Test success message */}
        {state.status === "tested" && (
          <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            测试成功
          </div>
        )}

        {/* Error message */}
        {state.status === "error" && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {"message" in state ? state.message : "操作失败"}
          </div>
        )}

        {/* Buttons */}
        <div className="flex gap-3">
          {!isSaved && (
            <button
              onClick={handleTest}
              disabled={
                state.status === "testing" ||
                state.status === "saving" ||
                !pushKeyInput.trim()
              }
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.status === "testing" ? "测试中..." : "测试推送"}
            </button>
          )}
          {!isSaved && (
            <button
              onClick={handleSave}
              disabled={state.status !== "tested"}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.status === "saving" ? "保存中..." : "保存"}
            </button>
          )}
          {isSaved && (
            <button
              onClick={() => {
                setState({ status: "empty" });
                setPushKeyInput("");
              }}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              重新配置
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
