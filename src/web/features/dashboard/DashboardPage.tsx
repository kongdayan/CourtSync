import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "../../lib/api";
import { useMe } from "../../lib/use-me";
import { Link } from "react-router-dom";
import { useState } from "react";

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

export function DashboardPage() {
  const [source, setSource] = useState("usthing");
  const { data: me } = useMe();

  const { data, isLoading, error } = useQuery<SlotsResponse>({
    queryKey: ["slots", source],
    queryFn: () => apiFetch(`/slots?source=${source}`),
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

      {/* Source tabs */}
      <div className="mb-4 flex gap-2">
        {data?.availableSources?.map((s) => (
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
      {isLoading && <p>加载中...</p>}
      {error && <p className="text-red-500">加载失败</p>}
      {data && (
        <>
          <p className="mb-2 text-sm text-muted-foreground">
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
            <p className="text-muted-foreground">暂无空闲场地</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2">日期</th>
                    <th className="py-2">时间</th>
                    <th className="py-2">场地</th>
                  </tr>
                </thead>
                <tbody>
                  {data.slots.map((slot, i) => (
                    <tr key={i} className="border-b">
                      <td className="py-2">{slot.Date}</td>
                      <td className="py-2">{slot.StartTime} - {slot.EndTime}</td>
                      <td className="py-2">{slot.FacilityID}</td>
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
