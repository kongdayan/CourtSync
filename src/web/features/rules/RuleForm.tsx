import { useState, useEffect, useCallback } from "react";
import type { DataSourceKey } from "@shared/sources";
import { HOURLY_TIMESLOTS } from "@shared/sources";

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

export interface RuleFormData {
  name: string;
  source: DataSourceKey;
  weekdays: number[];
  facilityIds: string[];
  timeslots: string[];
  minConsecutive: number;
  pushLimit: number;
  enabled: boolean;
}

interface RuleOptions {
  sources: Array<{ key: string; name: string }>;
  facilities: Record<string, Array<{ id: string; label: string }>>;
  weekdays: Array<{ value: number; label: string }>;
  timeslots: Array<{ index: number; start: string; end: string }>;
  pushLimitOptions: Array<{ value: number; label: string }>;
}

interface RuleFormProps {
  initialData?: Partial<RuleFormData>;
  onSubmit: (data: RuleFormData) => Promise<void>;
  isSubmitting: boolean;
  onCancel: () => void;
}

const WEEKDAY_LABELS: Record<number, string> = {
  1: "周一",
  2: "周二",
  3: "周三",
  4: "周四",
  5: "周五",
  6: "周六",
  7: "周日",
};

/* ------------------------------------------------------------------ */
/*  Mask helpers                                                      */
/* ------------------------------------------------------------------ */

function maskToWeekdays(mask: number): number[] {
  const days: number[] = [];
  for (let i = 0; i < 7; i++) {
    if (mask & (1 << i)) days.push(i + 1);
  }
  return days;
}

function maskToTimeslots(mask: number): string[] {
  const slots: string[] = [];
  for (let i = 0; i < HOURLY_TIMESLOTS.length; i++) {
    if (mask & (1 << i)) slots.push(HOURLY_TIMESLOTS[i].start);
  }
  return slots;
}

/* ------------------------------------------------------------------ */
/*  Live summary                                                      */
/* ------------------------------------------------------------------ */

function ruleSummary(data: RuleFormData, options: RuleOptions | null): string {
  const wd =
    data.weekdays.length === 0
      ? "每天"
      : data.weekdays
          .map((d) => WEEKDAY_LABELS[d] ?? "")
          .filter(Boolean)
          .join("、");
  const fac =
    data.facilityIds.length === 0
      ? "任意场地"
      : options
          ? data.facilityIds
              .map((id) => {
                const cat = options.facilities[data.source] ?? [];
                return cat.find((f) => f.id === id)?.label ?? id;
              })
              .join("、")
          : `${data.facilityIds.length}个场地`;
  const ts =
    data.timeslots.length === 0
      ? "全天"
      : `${data.timeslots[0]}-${data.timeslots[data.timeslots.length - 1]}`;
  const con = data.minConsecutive > 1 ? `，连订${data.minConsecutive}场` : "";
  return `${wd} · ${fac} · ${ts}${con}`;
}

/* ------------------------------------------------------------------ */
/*  Component                                                         */
/* ------------------------------------------------------------------ */

export function RuleForm({ initialData, onSubmit, isSubmitting, onCancel }: RuleFormProps) {
  const [options, setOptions] = useState<RuleOptions | null>(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState(false);

  /* ---- form state ---- */
  const [name, setName] = useState(initialData?.name ?? "");
  const [source, setSource] = useState<DataSourceKey>(
    (initialData?.source as DataSourceKey) ?? "usthing",
  );
  const [weekdays, setWeekdays] = useState<number[]>(initialData?.weekdays ?? []);
  const [facilityIds, setFacilityIds] = useState<string[]>(initialData?.facilityIds ?? []);
  const [timeslots, setTimeslots] = useState<string[]>(initialData?.timeslots ?? []);
  const [minConsecutive, setMinConsecutive] = useState(initialData?.minConsecutive ?? 1);
  const [pushLimit, setPushLimit] = useState(initialData?.pushLimit ?? 3);
  const [enabled, setEnabled] = useState(initialData?.enabled ?? true);

  /* source-switch confirmation dialog */
  const [pendingSource, setPendingSource] = useState<DataSourceKey | null>(null);

  /* ---- fetch options ---- */
  useEffect(() => {
    let cancelled = false;
    setOptionsLoading(true);
    setOptionsError(false);
    fetch("/api/rule-options", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setOptions(data as RuleOptions);
          setOptionsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOptionsError(true);
          setOptionsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /* ---- handlers ---- */
  const handleSourceSwitch = useCallback(
    (newSource: DataSourceKey) => {
      if (facilityIds.length === 0) {
        setSource(newSource);
        setFacilityIds([]);
      } else {
        setPendingSource(newSource);
      }
    },
    [facilityIds.length],
  );

  const confirmSourceSwitch = useCallback(() => {
    if (pendingSource) {
      setSource(pendingSource);
      setFacilityIds([]);
      setPendingSource(null);
    }
  }, [pendingSource]);

  const cancelSourceSwitch = useCallback(() => {
    setPendingSource(null);
  }, []);

  const toggleWeekday = useCallback((day: number) => {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day].sort(),
    );
  }, []);

  const toggleFacility = useCallback((id: string) => {
    setFacilityIds((prev) =>
      prev.includes(id) ? prev.filter((f) => f !== id) : [...prev, id],
    );
  }, []);

  const toggleTimeslot = useCallback((start: string) => {
    setTimeslots((prev) =>
      prev.includes(start) ? prev.filter((t) => t !== start) : [...prev, start].sort(),
    );
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;
      await onSubmit({
        name: name.trim(),
        source,
        weekdays,
        facilityIds,
        timeslots,
        minConsecutive,
        pushLimit,
        enabled,
      });
    },
    [name, source, weekdays, facilityIds, timeslots, minConsecutive, pushLimit, enabled, onSubmit],
  );

  /* ---- derived ---- */
  const formData: RuleFormData = {
    name,
    source,
    weekdays,
    facilityIds,
    timeslots,
    minConsecutive,
    pushLimit,
    enabled,
  };
  const facilities = options?.facilities[source] ?? [];
  const summary = ruleSummary(formData, options);

  /* ---- loading / error states ---- */
  if (optionsLoading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-muted-foreground">加载中...</p>
      </div>
    );
  }

  if (optionsError || !options) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <p className="text-red-500">选项加载失败，请刷新页面重试</p>
      </div>
    );
  }

  /* ---- render ---- */
  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Source selection */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">场地来源</legend>
        <div className="flex gap-2">
          {options.sources.map((s) => (
            <label
              key={s.key}
              className={`cursor-pointer rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                source === s.key
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              <input
                type="radio"
                name="source"
                value={s.key}
                checked={source === s.key}
                onChange={() => handleSourceSwitch(s.key as DataSourceKey)}
                className="sr-only"
              />
              {s.name}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Source-switch confirmation dialog */}
      {pendingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-sm rounded-lg bg-white p-6 shadow-xl">
            <p className="mb-4 text-sm">
              切换场地来源将清空已选场地，是否确认切换？
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelSourceSwitch}
                className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
              >
                取消
              </button>
              <button
                type="button"
                onClick={confirmSourceSwitch}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700"
              >
                确认切换
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Name */}
      <div>
        <label htmlFor="rule-name" className="mb-1 block text-sm font-medium">
          规则名称
        </label>
        <input
          id="rule-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={80}
          required
          placeholder="例如：工作日晚上"
          className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        />
      </div>

      {/* Weekdays */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          星期{weekdays.length === 0 && <span className="text-gray-400">（未选择 = 每天）</span>}
        </legend>
        <div className="flex flex-wrap gap-2">
          {options.weekdays.map((wd) => (
            <label
              key={wd.value}
              className={`cursor-pointer rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                weekdays.includes(wd.value)
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={weekdays.includes(wd.value)}
                onChange={() => toggleWeekday(wd.value)}
                className="sr-only"
              />
              {wd.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Facilities */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          场地
          {facilityIds.length === 0 && (
            <span className="text-gray-400">（未选择 = 任意场地）</span>
          )}
        </legend>
        <div className="grid max-h-48 grid-cols-3 gap-1 overflow-y-auto rounded-lg border p-2 sm:grid-cols-4 md:grid-cols-5">
          {facilities.map((fac) => (
            <label
              key={fac.id}
              className={`cursor-pointer rounded px-2 py-1 text-xs transition-colors ${
                facilityIds.includes(fac.id)
                  ? "bg-blue-50 text-blue-700 font-medium"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <input
                type="checkbox"
                checked={facilityIds.includes(fac.id)}
                onChange={() => toggleFacility(fac.id)}
                className="sr-only"
              />
              {fac.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Timeslots */}
      <fieldset>
        <legend className="mb-2 text-sm font-medium">
          时间段
          {timeslots.length === 0 && (
            <span className="text-gray-400">（未选择 = 全天）</span>
          )}
        </legend>
        <div className="flex flex-wrap gap-1">
          {options.timeslots.map((ts) => (
            <label
              key={ts.start}
              className={`cursor-pointer rounded-lg border px-2 py-1 text-xs transition-colors ${
                timeslots.includes(ts.start)
                  ? "border-blue-500 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              <input
                type="checkbox"
                checked={timeslots.includes(ts.start)}
                onChange={() => toggleTimeslot(ts.start)}
                className="sr-only"
              />
              {ts.start}-{ts.end}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Min consecutive */}
      <div>
        <label htmlFor="min-consecutive" className="mb-1 block text-sm font-medium">
          最少连续场次
        </label>
        <select
          id="min-consecutive"
          value={minConsecutive}
          onChange={(e) => setMinConsecutive(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {Array.from({ length: 12 }, (_, i) => i + 1).map((v) => (
            <option key={v} value={v}>
              {v} 场
            </option>
          ))}
        </select>
      </div>

      {/* Push limit */}
      <div>
        <label htmlFor="push-limit" className="mb-1 block text-sm font-medium">
          推送上限
        </label>
        <select
          id="push-limit"
          value={pushLimit}
          onChange={(e) => setPushLimit(Number(e.target.value))}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
        >
          {options.pushLimitOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {pushLimit === 0 && (
          <p className="mt-1 text-xs text-amber-600">
            推送上限为关闭时，规则将被自动禁用
          </p>
        )}
      </div>

      {/* Enabled toggle */}
      <div className="flex items-center gap-3">
        <label htmlFor="rule-enabled" className="text-sm font-medium">
          启用规则
        </label>
        <button
          id="rule-enabled"
          type="button"
          role="switch"
          aria-checked={enabled}
          onClick={() => setEnabled((e) => !e)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
            enabled ? "bg-blue-600" : "bg-gray-300"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
              enabled ? "translate-x-[18px]" : "translate-x-[2px]"
            }`}
          />
        </button>
      </div>

      {/* Live summary */}
      <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-600">
        <span className="font-medium">规则摘要：</span>
        {summary}
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg bg-gray-100 px-4 py-2 text-sm text-gray-700 hover:bg-gray-200"
        >
          取消
        </button>
        <button
          type="submit"
          disabled={isSubmitting || !name.trim()}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isSubmitting ? "保存中..." : "保存"}
        </button>
      </div>
    </form>
  );
}
