import type { ReactNode } from "react";
import { Link } from "react-router-dom";

interface PageHeaderProps {
  title: string;
  description?: ReactNode;
  backTo?: string;
  backLabel?: string;
  actions?: ReactNode;
}

export function PageHeader({
  title,
  description,
  backTo = "/",
  backLabel = "返回首页",
  actions,
}: PageHeaderProps) {
  return (
    <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {description && (
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Link
          to={backTo}
          className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          {backLabel}
        </Link>
        {actions}
      </div>
    </header>
  );
}
