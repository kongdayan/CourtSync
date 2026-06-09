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

// -- Design tokens: status-aware pill classes --
function isAvailable(s: string) { return s === "available"; }
function isOccupied(s: string) { return s === "reserved" || s === "not available" || s === "unavailable"; }
function isMaintenance(s: string) { return s === "maintenance" || s === "cleaning"; }

function norm(s: string) { return s.trim().toLowerCase(); }

function statusPill(status: string): string {
  const s = norm(status);
  if (isAvailable(s)) return "bg-emerald-100 text-emerald-700 border-emerald-200";
  if (isOccupied(s)) return "bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600";
  if (isMaintenance(s)) return "bg-amber-100 text-amber-700 border-amber-200";
  return "bg-slate-100 text-slate-600 border-slate-200";
}

function statusLabel(status: string): string {
  const s = norm(status);
  if (isAvailable(s)) return "空闲";
  if (isOccupied(s)) return "已占用";
  if (isMaintenance(s)) return "维护";
  return status;
}

function statusDot(status: string): string {
  const s = norm(status);
  if (isAvailable(s)) return "bg-emerald-500";
  if (isOccupied(s)) return "bg-slate-400 dark:bg-slate-500";
  if (isMaintenance(s)) return "bg-amber-500";
  return "bg-slate-400";
}

function statusRect(status: string): string {
  const s = norm(status);
  if (isAvailable(s)) return "bg-emerald-400 dark:bg-emerald-500";
  if (isOccupied(s)) return "bg-slate-400 dark:bg-slate-500";
  if (isMaintenance(s)) return "bg-amber-400 dark:bg-amber-500";
  return "bg-slate-300 dark:bg-slate-600";
}

export function DashboardPage() {
  const [source, setSource] = useState("usthing");
  const [page, setPage] = useState(0);
  const [compact, setCompact] = useState(false);
  const [dark, setDark] = useState(() =>
    typeof window !== "undefined" && document.documentElement.classList.contains("dark")
  );
  const { data: me } = useMe();

  const { data, isLoading, error } = useQuery<SlotsResponse>({
    queryKey: ["slots", source],
    queryFn: () =>
      fetch(`/api/slots?source=${source}`, { credentials: "include" }).then((r) => r.json()),
    retry: 1,
    staleTime: 60_000,
  });

  const sourceKey = source as DataSourceKey;

  const toggleDark = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
  };

  const { dates, slotsByDateTime, totalPages, facilityOrder } = useMemo(() => {
    if (!data?.slots.length) {
      return { dates: [], slotsByDateTime: new Map(), totalPages: 0, facilityOrder: [] };
    }
    const uniqueDates = [...new Set(data.slots.map((s) => s.Date))].sort();
    const tp = Math.max(1, Math.ceil(uniqueDates.length / PAGE_SIZE));
    const cp = Math.min(Math.max(page, 0), tp - 1);
    const displayDates = uniqueDates.slice(cp * PAGE_SIZE, cp * PAGE_SIZE + PAGE_SIZE);

    const byDateTime = new Map<string, Slot[]>();
    for (const slot of data.slots) {
      if (!displayDates.includes(slot.Date)) continue;
      const key = `${slot.Date}|${slot.StartTime}`;
      if (!byDateTime.has(key)) byDateTime.set(key, []);
      byDateTime.get(key)!.push(slot);
    }
    byDateTime.forEach((list) => list.sort((a, b) => a.FacilityID.localeCompare(b.FacilityID)));

    const known = listKnownFacilities(sourceKey);
    const fo: string[] = [];
    const foSet = new Set<string>();
    for (const [id] of known) { fo.push(id); foSet.add(id); }
    for (const slot of data.slots) {
      if (!foSet.has(slot.FacilityID)) { foSet.add(slot.FacilityID); fo.push(slot.FacilityID); }
    }
    return { dates: displayDates, slotsByDateTime: byDateTime, totalPages: tp, facilityOrder: fo };
  }, [data, source, page]);

  const handleExport = () => {
    if (!data?.slots.length) return;
    const rows = data.slots.map(
      (s) => `${s.Date},${s.StartTime},${s.EndTime},${resolveFacilityName(s.FacilityID, sourceKey)},${s.Status}`
    );
    const csv = ["Date,Start,End,Facility,Status", ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `courtsync-${source}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // ---- shared helper: action button ----------
  const Btn = (p: { active?: boolean; onClick: () => void; children: React.ReactNode }) => (
    <button
      onClick={p.onClick}
      className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150
        ${p.active
          ? "border-indigo-300 bg-indigo-50 text-indigo-700 shadow-sm dark:border-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-200"
          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:shadow-sm dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-700"
        }`}
    >
      {p.children}
    </button>
  );

  return (
    <div className={`min-h-screen transition-colors ${dark ? "bg-slate-900 text-slate-100" : "bg-slate-50 text-slate-800"}`}>
      <div className="mx-auto max-w-[1480px] px-4 py-6">

        {/* ====== Top Bar ====== */}
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-800 dark:text-slate-100">
              CourtSync <span className="font-normal text-slate-400">场地空闲</span>
            </h1>
            <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
              Live snapshot grouped by date and timeslot
            </p>
          </div>

          <nav className="flex items-center gap-3">
            {me ? (
              <>
                <Link to="/account" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">
                  账户
                </Link>
                <Link to="/rules" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">
                  通知规则
                </Link>
              </>
            ) : (
              <Link to="/login" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors">
                登录
              </Link>
            )}
          </nav>
        </header>

        {/* ====== Controls card ====== */}
        <div className={`mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border px-4 py-3 shadow-sm transition-colors
          ${dark ? "border-slate-700 bg-slate-800/60" : "border-slate-200 bg-white"}`}>

          {/* Source tabs — pill style */}
          <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700">
            {SOURCES.map((s) => (
              <button
                key={s.key}
                onClick={() => { setSource(s.key); setPage(0); }}
                className={`rounded-md px-4 py-1.5 text-sm font-medium transition-all duration-150
                  ${source === s.key
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
                  }`}
              >
                {s.name}
              </button>
            ))}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Btn onClick={handleExport}>📸 导出快照</Btn>
            <Btn active={compact} onClick={() => setCompact(!compact)}>Compact</Btn>
            <Btn active={dark} onClick={toggleDark}>🌙 Dark</Btn>
          </div>
        </div>

        {/* ====== Meta bar ====== */}
        {data && (
          <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
            <span>⏱ {new Date(data.lastUpdatedAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" })} (UTC+8)</span>
            <span>🧮 共 {data.count.toLocaleString()} 条</span>
            <span>📡 {source === "usthing" ? "香港科技大学" : "上海万体汇羽毛球馆"}</span>
          </div>
        )}

        {/* ====== Loading ====== */}
        {isLoading && (
          <div className={`flex items-center justify-center rounded-xl border py-20 ${dark ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-white"}`}>
            <div className="flex items-center gap-2 text-slate-400">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              加载中...
            </div>
          </div>
        )}

        {/* ====== Error ====== */}
        {error && (
          <div className={`flex items-center gap-3 rounded-xl border px-5 py-4 text-sm
            ${dark ? "border-rose-800 bg-rose-950/50 text-rose-300" : "border-rose-200 bg-rose-50 text-rose-700"}`}>
            <span className="text-lg">⚠️</span>
            加载失败，请刷新页面重试
          </div>
        )}

        {/* ====== Empty ====== */}
        {data && data.slots.length === 0 && (
          <div className={`rounded-xl border py-20 text-center ${dark ? "border-slate-700 bg-slate-800/40" : "border-slate-200 bg-white"}`}>
            <p className="text-sm text-slate-400">暂无空闲场地数据</p>
            {data.warnings.length > 0 && (
              <div className="mt-3 space-y-1">
                {data.warnings.map((w, i) => (
                  <p key={i} className="text-xs text-amber-600 dark:text-amber-400">{w}</p>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ====== Calendar ====== */}
        {data && data.slots.length > 0 && (
          <>
            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mb-4 flex items-center justify-between">
                <span className="text-xs text-slate-400">{dates[0]} – {dates[dates.length - 1]}</span>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                  >
                    ← Prev
                  </button>
                  <span className="min-w-[60px] text-center text-xs text-slate-400">
                    {page + 1} / {totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                    disabled={page >= totalPages - 1}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-30 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-slate-600"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}

            {/* Grid */}
            <div className={`overflow-x-auto rounded-xl border shadow-sm ${dark ? "border-slate-700" : "border-slate-200"}`}>
              <table className="w-full border-collapse">
                <thead>
                  <tr className={dark ? "bg-slate-800" : "bg-slate-100"}>
                    <th className={`sticky left-0 z-10 border-b px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400
                      ${dark ? "border-slate-700 bg-slate-800" : "border-slate-200 bg-slate-100"}`}>
                      Time
                    </th>
                    {dates.map((date) => (
                      <th key={date} className={`border-b px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400
                        ${dark ? "border-slate-700" : "border-slate-200"}`}>
                        {new Date(date + "T00:00:00").toLocaleDateString("zh-CN", { month: "short", day: "numeric" })}
                        <div className="text-[10px] font-normal text-slate-400">{new Date(date + "T00:00:00").toLocaleDateString("zh-CN", { weekday: "short" })}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {TIME_GRID.map((time, ti) => {
                    const endHour = String(Number(time.split(":")[0]) + 1).padStart(2, "0") + ":00";
                    const isEven = ti % 2 === 0;
                    return (
                      <tr key={time} className={`transition-colors ${dark ? "hover:bg-slate-800/50" : "hover:bg-indigo-50/30"}`}>
                        <td className={`sticky left-0 z-10 border-b px-4 py-2 text-xs font-medium whitespace-nowrap text-slate-500 dark:text-slate-400
                          ${dark
                            ? `border-slate-700 ${isEven ? "bg-slate-850" : "bg-slate-900"}`
                            : `border-slate-100 ${isEven ? "bg-slate-50" : "bg-white"}`}`}>
                          <span className="tabular-nums">{time}</span>
                          <span className="text-slate-300 dark:text-slate-600"> – </span>
                          <span className="tabular-nums">{endHour}</span>
                        </td>
                        {dates.map((date) => {
                          const key = `${date}|${time}`;
                          const cellSlots = slotsByDateTime.get(key) || [];
                          const hasContent = cellSlots.length > 0;
                          return (
                            <td
                              key={date}
                              className={`border-b px-1.5 py-1 align-top text-center
                                ${dark
                                  ? `border-slate-700/50 ${hasContent ? "bg-transparent" : "bg-slate-900/50"}`
                                  : `border-slate-100 ${hasContent ? "bg-white" : "bg-slate-50/60"}`}`}
                            >
                              {compact ? (
                                  <div className={`grid gap-px ${source === "jiushi" ? "grid-cols-7" : "grid-cols-4"}`}>
                                    {facilityOrder.map((fid) => {
                                      const s = cellSlots.find((cs: Slot) => cs.FacilityID === fid);
                                      if (!s) return <div key={fid} className="invisible h-4 select-none" />;
                                      return (
                                        <span
                                          key={fid}
                                          className={`block h-4 w-full rounded-sm cursor-pointer ${statusRect(s.Status)}`}
                                          title={`${resolveFacilityName(fid, sourceKey)}: ${statusLabel(s.Status)}`}
                                        />
                                      );
                                    })}
                                  </div>
                              ) : (
                                <div className="flex flex-col gap-0.5">
                                  {facilityOrder.map((fid) => {
                                    const s = cellSlots.find((cs: Slot) => cs.FacilityID === fid);
                                    if (!s) return <div key={fid} className="text-[10px] leading-none invisible select-none">-</div>;
                                    return (
                                      <span
                                        key={fid}
                                        className={`inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium leading-none ${statusPill(s.Status)}`}
                                        title={`${resolveFacilityName(fid, sourceKey)}: ${statusLabel(s.Status)}`}
                                      >
                                        <span className={`h-1.5 w-1.5 rounded-full ${statusDot(s.Status)}`} />
                                        {resolveFacilityName(fid, sourceKey)}
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

            {/* Legend */}
            <div className={`mt-4 flex flex-wrap items-center gap-4 rounded-lg border px-4 py-2.5 text-xs
              ${dark ? "border-slate-700 bg-slate-800/40 text-slate-400" : "border-slate-200 bg-white text-slate-500"}`}>
              <span className="font-medium text-slate-600 dark:text-slate-300">图例</span>
              {[
                { status: "Available", label: "空闲", dot: "bg-emerald-500", pill: "bg-emerald-100 text-emerald-700 border-emerald-200" },
                { status: "Reserved", label: "已占用", dot: "bg-slate-400 dark:bg-slate-500", pill: "bg-slate-200 text-slate-600 border-slate-300 dark:bg-slate-700 dark:text-slate-300 dark:border-slate-600" },
                { status: "Maintenance", label: "维护", dot: "bg-amber-500", pill: "bg-amber-100 text-amber-700 border-amber-200" },
              ].map((item) => (
                <span key={item.status} className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 ${item.pill}`}>
                  <span className={`h-2 w-2 rounded-full ${item.dot}`} />
                  {item.label}
                </span>
              ))}
            </div>

            {/* Social footer */}
            <div className={`mt-8 rounded-xl border px-6 py-5 shadow-sm ${dark ? "border-slate-700 bg-slate-800/60" : "border-slate-200 bg-white"}`}>
              <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">🤝 Connect with me</h3>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Curious about what I am building next? Follow along for behind-the-scenes updates and side projects.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <a
                  href="https://x.com/Kook91513056"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-sky-600 transition-all hover:border-sky-300 hover:bg-sky-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-slate-700"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                  <span>@Kook91513056</span>
                </a>
                <a
                  href="https://github.com/kongdayan"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 transition-all hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
                  <span>GitHub</span>
                </a>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
