import { createBrowserRouter } from "react-router-dom";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { LoginPage } from "../features/auth/LoginPage";
import { AccountPage } from "../features/account/AccountPage";
import { RulesPage } from "../features/rules/RulesPage";
import { RuleEditorPage } from "../features/rules/RuleEditorPage";
import { PushDeerSettingsPage } from "../features/channels/PushDeerSettingsPage";
import { AdminUsersPage } from "../features/admin/AdminUsersPage";
import { RequireAccess } from "../features/auth/RequireAccess";

export const router = createBrowserRouter([
  { path: "/", element: <DashboardPage /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/account", element: <AccountPage /> },
  {
    element: <RequireAccess status="active" />,
    children: [
      { path: "/rules", element: <RulesPage /> },
      { path: "/rules/new", element: <RuleEditorPage /> },
      { path: "/rules/:ruleId", element: <RuleEditorPage /> },
      { path: "/settings/notifications", element: <PushDeerSettingsPage /> },
    ],
  },
  { path: "/admin/users", element: <AdminUsersPage /> },
]);
