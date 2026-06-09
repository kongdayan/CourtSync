import { createBrowserRouter } from "react-router-dom";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LoginPage } from "../features/auth/LoginPage";
import { AccountPage } from "../features/account/AccountPage";
import { RequireAccess } from "../features/auth/RequireAccess";
import { ComingSoonPage } from "../features/shared/ComingSoonPage";

export const router = createBrowserRouter([
  { path: "/", element: <DashboardPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/account", element: <AccountPage /> },
  {
    element: <RequireAccess status="active" />,
    children: [
      { path: "/rules", element: <ComingSoonPage title="通知规则" /> },
      { path: "/settings/notifications", element: <ComingSoonPage title="推送设置" /> },
    ],
  },
]);
