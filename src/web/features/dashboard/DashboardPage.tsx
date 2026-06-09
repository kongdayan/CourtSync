import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/use-me";
import { Link } from "react-router-dom";
import { useState } from "react";
import { FACILITY_CATALOG, type FacilityOption } from "../../../../ts/rules/catalog";

const SOURCES = [
  { key: "usthing", name: "香港科技大学" },
  { key: "jiushi", name: "上海万体汇羽毛球馆" },
] as const;

interface Slot {
  FacilityID: string;
  Date: string;
  StartTime: string;
  EndTime: string;
  Status: string;
  ActivityName: string;
}

interface SlotsResponse {
  source: string;
  sourceName: string;
  count: number;
  startDate: string;
  endDate: string;
  lastUpdatedAt: string;
  warnings: string[];
  slots: Slot[];
  availableSources: Array<{ key: string; name: string }>;
}

function facilityLabel(facilityId: string): string {
  for (const options of Object.values(FACILITY_CATALOG as Record<string, FacilityOption[]>)) {
    const found = options.find((f) => f.id === facilityId);
    if (found) return found.label;
  }
  return facilityId;
}

export function DashboardPage() {
  const [source, setSource] = useState("usthing");
  const { data: me } = useMe();

  const { data, isLoading, error } = useQuery<SlotsResponse>({
    queryKey: ["slots", source],
    queryFn: () => apiFetch(`/slots?source=${source}`),
    retry: 1,
    staleTime: 60_000,
  });

  return (
    <div className="mx-auto max-w-4xl p-4">
      {/* Navigation */}
      <header className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold">CourtSync 场地空闲</h1>
        <nav className="flex gap-4">
          {me ? (
            <>
              <Link to="/account" className="text-sm text-blue-600 hover:underline">账户</Link>
              <Link to="/rules" className="text-sm text-blue-600 hover:underline">通知规则</Link>
            </>
          ) : (
            <Link to="/login" className="text-sm text-blue-600 hover:underline">登录</Link>
          )}
        </nav>
      </header>

      {/* Source tabs — always visible */}
      <div className="mb-4 flex gap-2">
        {SOURCES.map((s) => (
          <button
            key={s.key}
            onClick={() => setSource(s.key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium ${
              source === s.key
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {s.name}
          </button>
        ))}
      </div>

      {/* Content */}
      {isLoading && <p className="text-gray-500">加载中...</p>}
      {error && (
        <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700">
          加载失败，请刷新页面重试
        </div>
      )}
      {data && (
        <>
          <p className="mb-2 text-sm text-gray-500">
            共 {data.count} 个空闲时段 &middot; 更新于 {new Date(data.lastUpdatedAt).toLocaleString("zh-CN")}
          </p>
          {data.warnings.length > 0 && (
            <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3">
              {data.warnings.map((w, i) => (
                <p key={i} className="text-sm text-yellow-800">{w}</p>
              ))}
            </div>
          )}
          {data.slots.length === 0 ? (
            <p className="text-gray-400">暂无空闲场地</p>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50 text-left">
                    <th className="px-4 py-2">日期</th>
                    <th className="px-4 py-2">时段</th>
                    <th className="px-4 py-2">场地</th>
                    <th className="px-4 py-2">状态</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slots.map((slot, i) => (
                    <tr key={i} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">{slot.Date}</td>
                      <td className="px-4 py-2">{slot.StartTime} - {slot.EndTime}</td>
                      <td className="px-4 py-2">{facilityLabel(slot.FacilityID)}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block rounded px-2 py-0.5 text-xs ${
                          slot.Status === "Available" ? "bg-green-100 text-green-700" :
                          slot.Status === "Reserved" ? "bg-red-100 text-red-700" : "bg-gray-100 text-gray-600"
                        }`}>
                          {slot.Status === "Available" ? "空闲" :
                           slot.Status === "Reserved" ? "已预约" :
                           slot.Status === "Maintenance" ? "维护" : slot.Status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
