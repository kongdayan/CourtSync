import { createBrowserRouter } from "react-router-dom";
import { DashboardPage } from "../features/dashboard/DashboardPage";
import { RequireAccess } from "../features/auth/RequireAccess";

export const router = createBrowserRouter([
  { path: "/", element: <DashboardPage /> },
  { path: "/login", lazy: async () => ({ Component: (await import("../features/auth/LoginPage")).LoginPage }) },
  { path: "/auth/popup-complete", lazy: async () => ({ Component: (await import("../features/auth/PopupCompletePage")).PopupCompletePage }) },
  { path: "/account", lazy: async () => ({ Component: (await import("../features/account/AccountPage")).AccountPage }) },
  {
    element: <RequireAccess status="active" />,
    children: [
      { path: "/rules", lazy: async () => ({ Component: (await import("../features/rules/RulesPage")).RulesPage }) },
      { path: "/rules/new", lazy: async () => ({ Component: (await import("../features/rules/RuleEditorPage")).RuleEditorPage }) },
      { path: "/rules/:ruleId", lazy: async () => ({ Component: (await import("../features/rules/RuleEditorPage")).RuleEditorPage }) },
      { path: "/settings/notifications", lazy: async () => ({ Component: (await import("../features/channels/PushDeerSettingsPage")).PushDeerSettingsPage }) },
    ],
  },
  { path: "/admin/users", lazy: async () => ({ Component: (await import("../features/admin/AdminUsersPage")).AdminUsersPage }) },
]);
