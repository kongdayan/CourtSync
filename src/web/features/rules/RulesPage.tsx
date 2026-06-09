import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/use-me";

interface Rule {
  id: string;
  name: string;
  source: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  weekdayMask: number;
  timeslotMask: number;
  facilityIds: string[];
  minConsecutive: number;
  pushLimit: number;
}

const SOURCE_NAMES: Record<string, string> = {
  usthing: "香港科技大学",
  jiushi: "上海万体汇羽毛球馆",
};

export function RulesPage() {
  const { data: me } = useMe();
  const {
    data: rules,
    isLoading,
    error,
  } = useQuery<Rule[]>({
    queryKey: ["rules"],
    queryFn: () => apiFetch("/rules"),
  });

  const ruleLimit = me?.access?.ruleLimit ?? 0;
  const ruleCount = rules?.length ?? 0;
  const atQuota = ruleCount >= ruleLimit && ruleLimit > 0;

  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Header */}
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">通知规则</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            已使用 {ruleCount} / {ruleLimit}
          </p>
        </div>
        <Link
          to={atQuota ? "#" : "/rules/new"}
          className={`rounded-lg px-4 py-2 text-sm font-medium ${
            atQuota
              ? "cursor-not-allowed bg-gray-200 text-gray-400"
              : "bg-blue-600 text-white hover:bg-blue-700"
          }`}
          onClick={(e) => {
            if (atQuota) e.preventDefault();
          }}
        >
          新建规则
        </Link>
      </header>

      {/* Quota warning */}
      {atQuota && (
        <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
          已达到规则上限，无法创建更多规则
        </div>
      )}

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

      {/* Empty */}
      {rules && rules.length === 0 && (
        <div className="flex min-h-[200px] items-center justify-center">
          <p className="text-muted-foreground">暂无规则，点击上方按钮创建</p>
        </div>
      )}

      {/* Rule cards */}
      {rules && rules.length > 0 && (
        <div className="space-y-3">
          {rules.map((rule) => (
            <Link
              key={rule.id}
              to={`/rules/${rule.id}`}
              className="block rounded-lg border border-gray-200 p-4 transition-colors hover:border-gray-300 hover:shadow-sm"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-medium">{rule.name}</h3>
                  <p className="mt-0.5 text-xs text-gray-500">
                    {SOURCE_NAMES[rule.source] ?? rule.source}
                  </p>
                </div>
                <span
                  className={`ml-3 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    rule.enabled
                      ? "bg-green-50 text-green-700"
                      : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {rule.enabled ? "已启用" : "已禁用"}
                </span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
