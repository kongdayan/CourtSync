import { useMe } from "../../lib/use-me";
import { authClient } from "../../lib/auth-client";
import { Navigate, useNavigate } from "react-router-dom";

export function AccountPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useMe();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">加载中...</div>;
  }

  if (!data) {
    return <Navigate to="/login" replace />;
  }

  const handleSignOut = async () => {
    await authClient.signOut();
    navigate("/");
  };

  return (
    <div className="mx-auto max-w-lg p-6">
      <h1 className="text-xl font-bold">账户</h1>
      <div className="mt-4 space-y-2 rounded-lg border p-4">
        <p><span className="font-medium">邮箱：</span>{data.user.email}</p>
        <p><span className="font-medium">姓名：</span>{data.user.name ?? "未设置"}</p>
        <p><span className="font-medium">角色：</span>{data.access.role === "admin" ? "管理员" : "普通用户"}</p>
        <p><span className="font-medium">状态：</span>{
          data.access.status === "active" ? "正常" :
          data.access.status === "pending" ? "等待审批" : "已禁用"
        }</p>
        <p><span className="font-medium">规则配额：</span>{data.access.ruleLimit}</p>
      </div>
      <button
        onClick={handleSignOut}
        className="mt-4 w-full rounded-lg bg-red-600 px-4 py-2 text-white hover:bg-red-700"
      >
        退出登录
      </button>
    </div>
  );
}
