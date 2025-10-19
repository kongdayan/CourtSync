import { UnifiedTimeSlot } from "../types";
import { resolveFacilityName } from "../constants/facilities";

interface RenderOptions {
  generatedAt: Date;
}

function statusColor(status: string): string {
  const normalized = status.trim().toLowerCase();
  if (normalized === "available") {
    return "bg-green-500 text-white";
  }
  if (normalized === "reserved") {
    return "bg-gray-400 text-gray-900";
  }
  if (normalized === "maintenance" || normalized === "cleaning") {
    return "bg-yellow-400 text-gray-900";
  }
  return "bg-slate-300 text-gray-800";
}

export function renderSlotsTable(
  slots: UnifiedTimeSlot[],
  options: RenderOptions
): string {
  const uniqueDates = Array.from(new Set(slots.map((slot) => slot.Date))).sort();
  const timeKeys = Array.from(new Set(slots.map((slot) => slot.StartTime))).sort();

  const timeLabels = timeKeys.map((start) => {
    const matching = slots.find((slot) => slot.StartTime === start);
    const label = matching ? `${start} - ${matching.EndTime}` : start;
    return { start, label };
  });

  const slotsByDateTime = new Map<string, UnifiedTimeSlot[]>();

  for (const slot of slots) {
    const key = `${slot.Date}|${slot.StartTime}`;
    if (!slotsByDateTime.has(key)) {
      slotsByDateTime.set(key, []);
    }
    slotsByDateTime.get(key)!.push(slot);
  }

  for (const [, list] of slotsByDateTime) {
    list.sort((a, b) => a.FacilityID.localeCompare(b.FacilityID));
  }

  const generated = options.generatedAt.toLocaleString("zh-CN", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });

  return `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>USThing 场地概览</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      * { box-sizing: border-box; }
      .slot-cell {
        display: grid;
        gap: 0.25rem;
      }
      .slot-badge {
        font-size: 0.7rem;
        line-height: 0.95rem;
      }
      @media (min-width: 768px) {
        td[data-slot-cell] {
          width: 10rem;
        }
      }
    </style>
  </head>
  <body class="bg-slate-100 text-gray-900">
    <div class="max-w-7xl mx-auto px-4 py-6">
      <header class="mb-6 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 class="text-2xl font-bold text-slate-900">USThing 场地状态</h1>
          <p class="text-sm text-slate-600">按日期与时间段展示的实时抓取结果</p>
        </div>
        <div class="text-sm text-slate-600">
          <p>数据生成时间（UTC+8）：<span class="font-medium">${generated}</span></p>
          <p>总时段数：<span class="font-medium">${slots.length}</span></p>
        </div>
      </header>

      <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table class="min-w-full divide-y divide-slate-200 text-sm">
          <thead class="bg-slate-50">
            <tr>
              <th class="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700">时间</th>
              ${uniqueDates
                .map(
                  (date) =>
                    `<th class="px-3 py-2 text-center font-semibold text-slate-700">${date}</th>`
                )
                .join("")}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200">
            ${timeLabels
              .map(({ start, label }) => {
                const rowCells = uniqueDates
                  .map((date) => {
                    const key = `${date}|${start}`;
                    const entries = slotsByDateTime.get(key) ?? [];
                    if (!entries.length) {
                      return `<td class="px-3 py-2 text-center text-slate-300">-</td>`;
                    }

                    const badges = entries
                      .map((slot) => {
                        const colorClass = statusColor(slot.Status);
                        const facilityName = resolveFacilityName(slot.FacilityID);
                        const activity = slot.ActivityName?.trim();
                        const label =
                          activity && activity.length > 0
                            ? `${facilityName} · ${activity}`
                            : facilityName;
                        return `<span class="slot-badge rounded-md px-2 py-1 ${colorClass}">${label}</span>`;
                      })
                      .join("");

                    return `<td class="px-3 py-2" data-slot-cell>
                      <div class="slot-cell">${badges}</div>
                    </td>`;
                  })
                    .join("");

                return `<tr>
                  <th class="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-700 font-mono">${label}</th>
                  ${rowCells}
                </tr>`;
              })
              .join("")}
          </tbody>
        </table>
      </div>

      <footer class="mt-6 text-xs text-slate-500">
        <p>状态颜色：<span class="inline-block h-3 w-3 rounded bg-green-500 align-middle"></span> 可预约 · <span class="inline-block h-3 w-3 rounded bg-gray-400 align-middle"></span> 已预定 · <span class="inline-block h-3 w-3 rounded bg-yellow-400 align-middle"></span> 维护/清洁 · 其他状态使用浅灰色。</p>
      </footer>
    </div>
  </body>
</html>`;
}
