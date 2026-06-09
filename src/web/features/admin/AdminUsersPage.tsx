import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useCallback } from "react";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/use-me";
import { UserAccessDialog } from "./UserAccessDialog";

interface AdminUserSummary {
  id: string;
  email: string;
  name: string;
  image?: string;
  role: string;
  status: string;
  ruleLimit: number;
  ruleCount: number;
  pushDeerConfigured: boolean;
  firstLoginAt: string;
  lastLoginAt: string;
}

const STATUS_BADGE: Record<string, string> = {
  pending: "bg-yellow-50 text-yellow-700",
  active: "bg-green-50 text-green-700",
  disabled: "bg-gray-100 text-gray-500",
};

const STATUS_LABEL: Record<string, string> = {
  pending: "待审批",
  active: "正常",
  disabled: "已禁用",
};

const ROLE_BADGE: Record<string, string> = {
  user: "bg-blue-50 text-blue-700",
  admin: "bg-purple-50 text-purple-700",
};

const ROLE_LABEL: Record<string, string> = {
  user: "用户",
  admin: "管理员",
};

export function AdminUsersPage() {
  const { data: me } = useMe();
  const queryClient = useQueryClient();

  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUserSummary | null>(null);

  const { data: users, isLoading, error } = useQuery<AdminUserSummary[]>({
    queryKey: ["admin-users", statusFilter, search],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (search) params.set("search", search);
      const qs = params.toString();
      return apiFetch(`/admin/users${qs ? `?${qs}` : ""}`);
    },
  });

  /* Not admin check */
  if (me && me.access.role !== "admin") {
    return (
      <div className="mx-auto max-w-4xl p-4">
        <h1 className="mb-4 text-xl font-bold">用户管理</h1>
        <p className="text-muted-foreground">无权访问</p>
      </div>
    );
  }

  const handleUserSaved = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["admin-users"] });
  }, [queryClient]);

  return (
    <div className="mx-auto max-w-5xl p-4">
      <h1 className="mb-6 text-xl font-bold">用户管理</h1>

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
          {["", "pending", "active", "disabled"].map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {s === "" ? "全部" : STATUS_LABEL[s] ?? s}
            </button>
          ))}
        </div>

        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="搜索邮箱或姓名..."
          className="min-w-[200px] rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-muted-foreground">加载中...</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-red-500">加载失败</p>
        </div>
      )}

      {/* Table */}
      {users && users.length === 0 && (
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-muted-foreground">暂无用户</p>
        </div>
      )}

      {users && users.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-gray-50 text-left">
                <th className="px-4 py-3 font-medium">用户</th>
                <th className="px-4 py-3 font-medium">状态</th>
                <th className="px-4 py-3 font-medium">角色</th>
                <th className="px-4 py-3 font-medium">规则</th>
                <th className="px-4 py-3 font-medium">推送</th>
                <th className="px-4 py-3 font-medium">最后登录</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr
                  key={u.id}
                  onClick={() => setSelectedUser(u)}
                  className="cursor-pointer border-b transition-colors hover:bg-gray-50"
                >
                  {/* User info */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {u.image ? (
                        <img
                          src={u.image}
                          alt=""
                          className="h-8 w-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-200 text-xs text-gray-500">
                          {(u.name ?? u.email).charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate font-medium">{u.name || "未设置姓名"}</p>
                        <p className="truncate text-xs text-gray-500">{u.email}</p>
                      </div>
                    </div>
                  </td>

                  {/* Status badge */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        STATUS_BADGE[u.status] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {STATUS_LABEL[u.status] ?? u.status}
                    </span>
                  </td>

                  {/* Role badge */}
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        ROLE_BADGE[u.role] ?? "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {ROLE_LABEL[u.role] ?? u.role}
                    </span>
                  </td>

                  {/* Rule usage */}
                  <td className="px-4 py-3 text-xs tabular-nums text-gray-600">
                    {u.ruleCount} / {u.ruleLimit}
                  </td>

                  {/* PushDeer */}
                  <td className="px-4 py-3">
                    {u.pushDeerConfigured ? (
                      <span className="text-green-600" title="已配置 PushDeer">
                        &#10003;
                      </span>
                    ) : (
                      <span className="text-gray-300">&mdash;</span>
                    )}
                  </td>

                  {/* Last login */}
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {u.lastLoginAt
                      ? new Date(u.lastLoginAt).toLocaleString("zh-CN", {
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : "从未登录"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Access dialog */}
      {selectedUser && (
        <UserAccessDialog
          user={selectedUser}
          onClose={() => setSelectedUser(null)}
          onSaved={handleUserSaved}
        />
      )}
    </div>
  );
}
