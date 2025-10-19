import { UnifiedTimeSlot } from "../types";
import { resolveFacilityName } from "../constants/facilities";

const DEFAULT_TIME_GRID = Array.from({ length: 15 }, (_, i) => {
  const hour = i + 8;
  return `${hour.toString().padStart(2, "0")}:00`;
});

interface RenderOptions {
  generatedAt: Date;
  page?: number;
  pageSize?: number;
  basePath?: string;
  baseQuery?: string;
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
  const pageSize = Math.max(1, options.pageSize ?? 8);
  const totalPages = Math.max(
    1,
    Math.ceil(uniqueDates.length / pageSize) || 1
  );
  const currentPage = Math.min(
    Math.max(options.page ?? 0, 0),
    totalPages - 1
  );
  const startIndex = currentPage * pageSize;
  const datesToDisplay = uniqueDates.slice(startIndex, startIndex + pageSize);
  const visibleSlots = slots.filter((slot) =>
    datesToDisplay.includes(slot.Date)
  );

  const slotsByDateTime = new Map<string, UnifiedTimeSlot[]>();

  for (const slot of visibleSlots) {
    const key = `${slot.Date}|${slot.StartTime}`;
    if (!slotsByDateTime.has(key)) {
      slotsByDateTime.set(key, []);
    }
    slotsByDateTime.get(key)!.push(slot);
  }

  for (const [, list] of slotsByDateTime) {
    list.sort((a, b) => a.FacilityID.localeCompare(b.FacilityID));
  }

  const timeSource = visibleSlots.length ? visibleSlots : slots;
  let timeKeys = Array.from(new Set(timeSource.map((slot) => slot.StartTime))).sort();
  if (!timeKeys.length) {
    timeKeys = DEFAULT_TIME_GRID;
  }

  const timeLabels = timeKeys.map((start) => {
    const matching = timeSource.find((slot) => slot.StartTime === start);
    const label = matching
      ? `${start} - ${matching.EndTime}`
      : `${start} - ${deriveEndTime(start)}`;
    return { start, label };
  });

  const basePath = options.basePath ?? "/";
  const baseQuery = options.baseQuery ?? "";
  const makePageLink = (target: number) => {
    const params = new URLSearchParams(baseQuery);
    params.set("format", "html");
    params.set("page", target.toString());
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const generated = options.generatedAt.toLocaleString("en-US", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>USThing Court Overview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = { darkMode: "class" };
    </script>
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
      .theme-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }
      .theme-toggle input {
        position: absolute;
        opacity: 0;
        pointer-events: none;
      }
      .toggle-track {
        position: relative;
        width: 2.75rem;
        height: 1.4rem;
        border-radius: 999px;
        background: rgba(148, 163, 184, 0.6);
        transition: background 0.2s ease;
      }
      .toggle-thumb {
        position: absolute;
        top: 0.15rem;
        left: 0.2rem;
        width: 1rem;
        height: 1rem;
        border-radius: 999px;
        background: #fff;
        box-shadow: 0 1px 4px rgba(15, 23, 42, 0.35);
        transition: transform 0.2s ease;
      }
      input:checked + .toggle-track {
        background: rgba(59, 130, 246, 0.8);
      }
      input:checked + .toggle-track .toggle-thumb {
        transform: translateX(1.3rem);
      }
    </style>
  </head>
  <body class="bg-slate-100 text-gray-900 transition-colors duration-300 dark:bg-slate-900 dark:text-slate-100">
    <div class="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <section class="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-white p-4 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div class="flex items-center gap-3">
          <h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">Follow for updates</h2>
          <label class="theme-toggle text-xs text-slate-600 dark:text-slate-300">
            <input id="theme-toggle" type="checkbox" />
            <span class="toggle-track">
              <span class="toggle-thumb"></span>
            </span>
            <span class="toggle-label">
              <span class="toggle-label-dark">Dark</span>
              <span class="toggle-label-light hidden">Light</span>
            </span>
          </label>
        </div>
        <div class="flex flex-wrap items-center gap-3 text-sm">
          <a class="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-sky-600 transition hover:border-sky-400 hover:bg-sky-50 dark:border-slate-600 dark:text-sky-400 dark:hover:bg-slate-700" href="https://x.com/Kook91513056" target="_blank" rel="noopener noreferrer">
            <img alt="Twitter" src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/x.svg" class="h-4 w-4" />
            <span>@Kook91513056</span>
          </a>
          <a class="flex items-center gap-1 rounded-full border border-slate-200 px-3 py-1 text-slate-700 transition hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-200 dark:hover:bg-slate-700" href="https://github.com/kongdayan" target="_blank" rel="noopener noreferrer">
            <img alt="GitHub" src="https://cdn.jsdelivr.net/gh/simple-icons/simple-icons/icons/github.svg" class="h-4 w-4" />
            <span>GitHub</span>
          </a>
        </div>
      </section>

      <header class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between text-slate-900 dark:text-slate-100">
        <div>
          <h1 class="text-2xl font-bold">USThing Timeslot Dashboard</h1>
          <p class="text-sm text-slate-600 dark:text-slate-300">Live snapshot grouped by date and timeslot</p>
        </div>
        <div class="text-sm text-slate-600 dark:text-slate-300">
          <p>Generated (UTC+8): <span class="font-medium text-slate-900 dark:text-slate-100">${generated}</span></p>
          <p>Total slots: <span class="font-medium text-slate-900 dark:text-slate-100">${slots.length}</span></p>
        </div>
      </header>

      <div class="mb-4 flex flex-wrap items-center justify-between gap-3 text-slate-600 dark:text-slate-300">
        <div>
          ${datesToDisplay.length
            ? `${datesToDisplay[0]} – ${
                datesToDisplay[datesToDisplay.length - 1]
              }`
            : "No dates available"}
        </div>
        ${
          totalPages > 1
            ? `<nav class="flex items-center gap-2 text-sm">
                ${
                  currentPage > 0
                    ? `<a class="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700" href="${makePageLink(
                        currentPage - 1
                      )}">&larr; Previous</a>`
                    : `<span class="rounded border border-transparent px-2 py-1 text-slate-300 dark:text-slate-600">&larr; Previous</span>`
                }
                <span class="text-slate-600 dark:text-slate-300">Page ${currentPage + 1} / ${totalPages}</span>
                ${
                  currentPage < totalPages - 1
                    ? `<a class="rounded border border-slate-300 px-2 py-1 hover:bg-slate-100 dark:border-slate-600 dark:hover:bg-slate-700" href="${makePageLink(
                        currentPage + 1
                      )}">Next &rarr;</a>`
                    : `<span class="rounded border border-transparent px-2 py-1 text-slate-300 dark:text-slate-600">Next &rarr;</span>`
                }
               </nav>`
            : ""
        }
      </div>

      <div class="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <table class="min-w-full table-fixed divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead class="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th class="sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">Time</th>
              ${datesToDisplay
                .map(
                  (date) =>
                    `<th class="px-3 py-2 text-center font-semibold text-slate-700 dark:text-slate-100">${date}</th>`
                )
                .join("")}
            </tr>
          </thead>
          <tbody class="divide-y divide-slate-200 dark:divide-slate-700">
            ${
              datesToDisplay.length
                ? timeLabels
                    .map(({ start, label }) => {
                      const rowCells = datesToDisplay
                        .map((date) => {
                          const key = `${date}|${start}`;
                          const entries = slotsByDateTime.get(key) ?? [];
                          if (!entries.length) {
                            return `<td class="px-3 py-2 text-center text-slate-300 dark:text-slate-500">-</td>`;
                          }

                          const badges = entries
                            .map((slot) => {
                              const colorClass = statusColor(slot.Status);
                              const facilityName = resolveFacilityName(slot.FacilityID);
                              const activity = slot.ActivityName?.trim() ?? "";
                              const classLabel =
                                activity.toLowerCase().includes("class")
                                  ? `<span class="ml-1 rounded bg-black/30 px-1.5 text-[0.55rem] font-medium uppercase tracking-wide text-white">Class</span>`
                                  : "";
                              return `<span class="slot-badge flex items-center rounded-md px-2 py-1 ${colorClass} dark:opacity-90">
                                <span>${facilityName}</span>
                                ${classLabel}
                              </span>`;
                            })
                            .join("");

                          return `<td class="px-3 py-2" data-slot-cell>
                            <div class="slot-cell">${badges}</div>
                          </td>`;
                        })
                        .join("");

                      return `<tr class="text-slate-700 dark:text-slate-200">
                        <th class="sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-700 font-mono dark:bg-slate-700 dark:text-slate-100">${label}</th>
                        ${rowCells}
                      </tr>`;
                    })
                    .join("")
                : ""
            }
            ${
              !datesToDisplay.length
                ? `<tr>
                    <td class="px-3 py-4 text-center text-slate-400 dark:text-slate-500" colspan="100%">
                      No data on this page
                    </td>
                  </tr>`
                : ""
            }
          </tbody>
        </table>
      </div>

      <footer class="space-y-3 text-xs text-slate-500">
        <p>Status legend: <span class="inline-block h-3 w-3 rounded bg-green-500 align-middle"></span> Available · <span class="inline-block h-3 w-3 rounded bg-gray-400 align-middle"></span> Reserved · <span class="inline-block h-3 w-3 rounded bg-yellow-400 align-middle"></span> Maintenance / Cleaning · other states appear in light gray.</p>
      </footer>
    </div>
    <script>
      (function () {
        const toggleInput = document.getElementById("theme-toggle");
        if (!(toggleInput instanceof HTMLInputElement)) return;
        const darkLabel = document.querySelector(".toggle-label-dark");
        const lightLabel = document.querySelector(".toggle-label-light");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const stored = localStorage.getItem("usthing-theme");
        const hour = ${options.generatedAt.getHours()};
        const timeBasedDefault = hour >= 19 || hour < 7 ? "dark" : "light";

        function apply(theme, syncInput = true) {
          const root = document.documentElement;
          const body = document.body;
          if (theme === "dark") {
            root.classList.add("dark");
            body.classList.add("bg-slate-900", "text-slate-100");
            body.classList.remove("bg-slate-100", "text-gray-900");
            darkLabel?.classList.add("hidden");
            lightLabel?.classList.remove("hidden");
            if (syncInput) toggleInput.checked = true;
          } else {
            root.classList.remove("dark");
            body.classList.add("bg-slate-100", "text-gray-900");
            body.classList.remove("bg-slate-900", "text-slate-100");
            darkLabel?.classList.remove("hidden");
            lightLabel?.classList.add("hidden");
            if (syncInput) toggleInput.checked = false;
          }
        }

        const initialTheme = stored ?? (prefersDark ? "dark" : timeBasedDefault);
        apply(initialTheme);

        toggleInput.addEventListener("change", () => {
          const next = toggleInput.checked ? "dark" : "light";
          localStorage.setItem("usthing-theme", next);
          apply(next, false);
        });
      })();
    </script>
  </body>
</html>`;
}

function deriveEndTime(start: string): string {
  const [hourStr, minuteStr = "00"] = start.split(":");
  const hour = Number.parseInt(hourStr, 10);
  if (Number.isNaN(hour)) {
    return start;
  }
  const endHour = Math.min(hour + 1, 23);
  return `${endHour.toString().padStart(2, "0")}:${minuteStr}`;
}

function truncate(value: string, max: number): string {
  if (value.length <= max) {
    return value;
  }
  return `${value.slice(0, max - 1)}…`;
}
