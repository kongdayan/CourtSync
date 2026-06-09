import { useQuery } from "@tanstack/react-query";
import { useMe } from "../../lib/use-me";
import { Link } from "react-router-dom";
import { useState, useMemo } from "react";
import { resolveFacilityName, listKnownFacilities } from "../../../../ts/constants/facilities";
import type { DataSourceKey } from "../../../../ts/types";

const TIME_GRID = Array.from({ length: 15 }, (_, i) => {
  const hour = i + 8;
  return `${String(hour).padStart(2, "0")}:00`;
});

const SOURCE_LABELS: Record<string, string> = {
  usthing: "USThing",
  jiushi: "Jiushi",
};

const SOURCES: Array<{ key: string; name: string }> = [
  { key: "usthing", name: "USThing" },
  { key: "jiushi", name: "Jiushi" },
];

interface Slot {
  FacilityID: string;
  Date: string;
  StartTime: string;
  EndTime: string;
  Status: string;
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
}

const PAGE_SIZE = 8;

function statusColor(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "available") return "bg-green-500 text-white";
  if (s === "reserved") return "bg-gray-400 text-gray-900";
  if (s === "maintenance" || s === "cleaning") return "bg-yellow-400 text-gray-900";
  return "bg-slate-300 text-gray-800";
}

function statusLabel(status: string): string {
  const s = status.trim().toLowerCase();
  if (s === "available") return "空闲";
  if (s === "reserved") return "已预约";
  if (s === "maintenance" || s === "cleaning") return "维护";
  return status;
}

export function DashboardPage() {
  const [source, setSource] = useState("usthing");
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(false);
  const [dark, setDark] = useState(() => {
    if (typeof window !== "undefined") {
      return document.documentElement.classList.contains("dark");
    }
    return false;
  });
  const { data: me } = useMe();

  const { data, isLoading, error } = useQuery<SlotsResponse>({
    queryKey: ["slots", source],
    queryFn: () =>
      fetch(`/api/slots?source=${source}`, { credentials: "include" }).then(
        (r) => r.json()
      ),
    retry: 1,
    staleTime: 60_000,
  });

  // Toggle dark mode
  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  // Date + timeslot grid data
  const { dates, slotsByDateTime, totalPages, facilityOrder } = useMemo(() => {
    if (!data?.slots.length) {
      return { dates: [], slotsByDateTime: new Map(), totalPages: 0, facilityOrder: [] };
    }

    const uniqueDates = [...new Set(data.slots.map((s) => s.Date))].sort();
    const tp = Math.max(1, Math.ceil(uniqueDates.length / PAGE_SIZE));
    const cp = Math.min(Math.max(page, 0), tp - 1);
    const startIdx = cp * PAGE_SIZE;
    const displayDates = uniqueDates.slice(startIdx, startIdx + PAGE_SIZE);

    const byDateTime = new Map<string, Slot[]>();
    for (const slot of data.slots) {
      if (!displayDates.includes(slot.Date)) continue;
      const key = `${slot.Date}|${slot.StartTime}`;
      if (!byDateTime.has(key)) byDateTime.set(key, []);
      byDateTime.get(key)!.push(slot);
    }
    byDateTime.forEach((list) => {
      list.sort((a, b) => a.FacilityID.localeCompare(b.FacilityID));
    });

    // Facility order
    const known = listKnownFacilities(source as DataSourceKey);
    const fo: string[] = [];
    const foSet = new Set<string>();
    for (const [id] of known) {
      fo.push(id);
      foSet.add(id);
    }
    for (const slot of data.slots) {
      if (!foSet.has(slot.FacilityID)) {
        foSet.add(slot.FacilityID);
        fo.push(slot.FacilityID);
      }
    }

    return { dates: displayDates, slotsByDateTime: byDateTime, totalPages: tp, facilityOrder: fo };
  }, [data, source, page]);

  // Snapshot export
  const handleExport = () => {
    if (!data?.slots.length) return;
    const rows = data.slots.map(
      (s) => `${s.Date},${s.StartTime},${s.EndTime},${resolveFacilityName(s.FacilityID)},${s.Status}`
    );
    const csv = ["Date,Start,End,Facility,Status", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `courtsync-${source}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className={`min-h-screen ${dark ? "bg-gray-950 text-gray-100" : "bg-white text-gray-900"}`}>
      <div className="mx-auto max-w-[1400px] p-4">
        {/* Navigation */}
        <header className="mb-4 flex items-center justify-between">
          <h1 className="text-xl font-bold">CourtSync 场地空闲</h1>
          <nav className="flex items-center gap-4">
            {me ? (
              <>
                <Link to="/account" className="text-sm text-blue-600 hover:underline">
                  账户
                </Link>
                <Link to="/rules" className="text-sm text-blue-600 hover:underline">
                  通知规则
                </Link>
              </>
            ) : (
              <Link to="/login" className="text-sm text-blue-600 hover:underline">
                登录
              </Link>
            )}
          </nav>
        </header>

        {/* Title bar */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold">Timeslot Dashboard</h2>
            <span className="text-xs text-gray-500">Live snapshot grouped by date and timeslot</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExport}
              className="rounded border px-3 py-1 text-xs hover:bg-gray-100 dark:border-gray-700 dark:hover:bg-gray-800"
              title="导出快照"
            >
              📸 导出快照
            </button>
            <button
              onClick={() => setCompact(!compact)}
              className={`rounded border px-3 py-1 text-xs ${
                compact ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800"
              } dark:border-gray-700`}
            >
              Compact
            </button>
            <button
              onClick={toggleDark}
              className={`rounded border px-3 py-1 text-xs ${
                dark ? "bg-blue-600 text-white" : "hover:bg-gray-100 dark:hover:bg-gray-800"
              } dark:border-gray-700`}
            >
              Dark
            </button>
          </div>
        </div>

        {/* Source tabs */}
        <div className="mb-4 flex gap-2">
          {SOURCES.map((s) => (
            <button
              key={s.key}
              onClick={() => { setSource(s.key); setPage(0); }}
              className={`rounded-lg px-4 py-2 text-sm font-medium ${
                source === s.key
                  ? "bg-blue-600 text-white"
                  : `border ${dark ? "border-gray-700 text-gray-300 hover:bg-gray-800" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Meta info */}
        {data && (
          <div className="mb-3 text-xs text-gray-500">
            ⏱ Generated (UTC+8): {new Date(data.lastUpdatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })}
            <span className="mx-2">|</span>
            🧮 Total slots collected: {data.count}
            <span className="mx-2">|</span>
            📡 Data source: {SOURCE_LABELS[source] ?? source}
          </div>
        )}

        {/* Content area */}
        {isLoading && (
          <div className={`rounded-lg border p-8 text-center ${dark ? "border-gray-700" : ""}`}>
            <p className="text-gray-500">加载中...</p>
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
            加载失败，请刷新页面重试
          </div>
        )}

        {data && data.slots.length === 0 && (
          <div className={`rounded-lg border p-8 text-center ${dark ? "border-gray-700" : ""}`}>
            <p className="text-gray-400">暂无空闲场地数据</p>
            {data.warnings.length > 0 && (
              <div className="mt-2 text-xs text-yellow-600">
                {data.warnings.map((w, i) => (
                  <p key={i}>{w}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {data && data.slots.length > 0 && (
          <>
            {/* Date pagination */}
            {totalPages > 1 && (
              <div className="mb-3 flex items-center gap-2 text-sm">
                <span className="text-gray-500">
                  {dates[0]} – {dates[dates.length - 1]}
                </span>
                <button
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  disabled={page === 0}
                  className="rounded border px-2 py-0.5 text-xs disabled:opacity-30 dark:border-gray-700"
                >
                  ← Previous
                </button>
                <span className="text-xs text-gray-400">
                  Page {page + 1} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                  disabled={page >= totalPages - 1}
                  className="rounded border px-2 py-0.5 text-xs disabled:opacity-30 dark:border-gray-700"
                >
                  Next →
                </button>
              </div>
            )}

            {/* Calendar grid */}
            <div className="overflow-x-auto rounded-lg border dark:border-gray-700">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className={dark ? "bg-gray-800" : "bg-gray-50"}>
                    <th className="sticky left-0 z-10 border-b px-3 py-2 text-left font-medium dark:border-gray-700 dark:bg-gray-800">
                      Time
                    </th>
                    {dates.map((date) => (
                      <th
                        key={date}
                        className="border-b px-2 py-2 text-center font-medium dark:border-gray-700"
                      >
                        {date}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_GRID.map((time) => {
                    const endHour = String(Number(time.split(":")[0]) + 1).padStart(2, "0") + ":00";
                    return (
                      <tr key={time} className={dark ? "hover:bg-gray-900" : "hover:bg-gray-50"}>
                        <td
                          className={`sticky left-0 z-10 border-b px-3 py-2 font-medium whitespace-nowrap ${
                            dark ? "border-gray-700 bg-gray-950" : "border-gray-200 bg-white"
                          }`}
                        >
                          {time} - {endHour}
                        </td>
                        {dates.map((date) => {
                          const key = `${date}|${time}`;
                          const cellSlots = slotsByDateTime.get(key) || [];
                          return (
                            <td
                              key={date}
                              className={`border-b px-1 py-1 text-center align-top dark:border-gray-700 ${
                                cellSlots.length === 0 ? (dark ? "bg-gray-900" : "bg-gray-50") : ""
                              }`}
                            >
                              {compact ? (
                                <div className="flex flex-wrap justify-center gap-0.5">
                                  {cellSlots.map((s: Slot) => (
                                    <span
                                      key={s.FacilityID}
                                      className={`inline-block rounded px-1 py-0.5 text-[10px] leading-none ${statusColor(s.Status)}`}
                                      title={`${resolveFacilityName(s.FacilityID)}: ${statusLabel(s.Status)}`}
                                    >
                                      {s.FacilityID}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  {facilityOrder.map((fid) => {
                                    const s = cellSlots.find((cs: Slot) => cs.FacilityID === fid);
                                    if (!s) return <div key={fid} className="text-[10px] leading-none invisible">-</div>;
                                    return (
                                      <span
                                        key={fid}
                                        className={`inline-block rounded px-1 py-0.5 text-[10px] leading-none ${statusColor(s.Status)}`}
                                        title={`${resolveFacilityName(fid)}: ${statusLabel(s.Status)}`}
                                      >
                                        {resolveFacilityName(fid)}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Status legend */}
            <div className="mt-3 text-xs text-gray-500">
              Status legend:{" "}
              <span className="inline-block rounded bg-green-500 px-2 py-0.5 text-white">Available</span>{" "}
              ·{" "}
              <span className="inline-block rounded bg-gray-400 px-2 py-0.5 text-gray-900">Reserved</span>{" "}
              ·{" "}
              <span className="inline-block rounded bg-yellow-400 px-2 py-0.5 text-gray-900">Maintenance / Cleaning</span>{" "}
              · other states appear in light gray.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
