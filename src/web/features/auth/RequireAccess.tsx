import { Navigate, Outlet } from "react-router-dom";
import { useMe } from "../../lib/use-me";

export function RequireAccess({ status }: { status: "active" }) {
  const { data, isLoading, error } = useMe();

  if (isLoading) {
    return <div className="flex min-h-screen items-center justify-center">加载中...</div>;
  }

  if (error) {
    return <div className="flex min-h-screen items-center justify-center text-red-500">加载失败，请刷新页面重试</div>;
  }

  if (!data) {
    return <Navigate to="/login" replace />;
  }

  if (data.access.status !== status) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">
          {data.access.status === "pending" ? "等待管理员审批" : "账户已被禁用"}
        </p>
      </div>
    );
  }

  return <Outlet />;
}
