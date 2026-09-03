import { useState, useCallback } from "react";
import { apiPatch, ApiError } from "../../lib/api";

interface UserAccess {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  ruleLimit: number;
  ruleCount: number;
}

interface UserAccessDialogProps {
  user: UserAccess;
  onClose: () => void;
  onSaved: () => void;
}

export function UserAccessDialog({ user, onClose, onSaved }: UserAccessDialogProps) {
  const [status, setStatus] = useState(user.status);
  const [role, setRole] = useState(user.role);
  const [ruleLimit, setRuleLimit] = useState(String(user.ruleLimit));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setSaving(true);
      setError(null);

      try {
        await apiPatch(`/admin/users/${user.id}/access`, {
          status,
          role,
          ruleLimit: Number(ruleLimit),
        });
        onSaved();
        onClose();
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          setError(err.code === "user_not_found" ? "用户不存在" : err.code);
        } else {
          setError("保存失败，请重试");
        }
      } finally {
        setSaving(false);
      }
    },
    [user.id, status, role, ruleLimit, onSaved, onClose],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold">
          编辑用户权限 - {user.name || user.email}
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Status */}
          <div>
            <label htmlFor="dialog-status" className="mb-1 block text-sm font-medium">
              状态
            </label>
            <select
              id="dialog-status"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="pending">待审批</option>
              <option value="active">正常</option>
              <option value="disabled">已禁用</option>
            </select>
          </div>

          {/* Role */}
          <div>
            <label htmlFor="dialog-role" className="mb-1 block text-sm font-medium">
              角色
            </label>
            <select
              id="dialog-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            >
              <option value="user">普通用户</option>
              <option value="admin">管理员</option>
            </select>
          </div>

          {/* Rule limit */}
          <div>
            <label htmlFor="dialog-rule-limit" className="mb-1 block text-sm font-medium">
              规则上限
            </label>
            <input
              id="dialog-rule-limit"
              type="number"
              min={0}
              max={1000}
              value={ruleLimit}
              onChange={(e) => setRuleLimit(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
            />
          </div>

          {/* Current values display */}
          <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500">
            <p>当前规则：{user.ruleCount} / {user.ruleLimit}</p>
          </div>

          {/* Error */}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "保存中..." : "保存"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
