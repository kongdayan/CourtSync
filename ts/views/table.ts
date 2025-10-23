import { UnifiedTimeSlot, DataSourceKey } from "../types";
import {
  resolveFacilityName,
  listKnownFacilities,
} from "../constants/facilities";

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
  warnings?: string[];
  source: DataSourceKey;
  availableSources?: DataSourceKey[];
  sourceLabels?: Partial<Record<DataSourceKey, string>>;
  sourceQueryBase?: string;
}

const SOURCE_LABELS: Record<DataSourceKey, string> = {
  usthing: "USThing",
  jiushi: "Jiushi",
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  const knownFacilities = listKnownFacilities(options.source);
  const facilityOrder: string[] = [];
  const facilityOrderSet = new Set<string>();
  for (const [id] of knownFacilities) {
    facilityOrder.push(id);
    facilityOrderSet.add(id);
  }
  const orderingSource = visibleSlots.length ? visibleSlots : slots;
  for (const slot of orderingSource) {
    if (!facilityOrderSet.has(slot.FacilityID)) {
      facilityOrderSet.add(slot.FacilityID);
      facilityOrder.push(slot.FacilityID);
    }
  }

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
  const sourceQueryBase = options.sourceQueryBase ?? "";
  const makeSourceLink = (target: DataSourceKey) => {
    const params = new URLSearchParams(sourceQueryBase);
    params.set("format", "html");
    params.delete("page");
    params.set("source", target);
    const qs = params.toString();
    return `${basePath}${qs ? `?${qs}` : ""}`;
  };

  const warnings = options.warnings ?? [];
  const tokenWarning = warnings.find((w) =>
    w.toLowerCase().includes("jwt")
  );
  const generated = options.generatedAt.toLocaleString("en-US", {
    hour12: false,
    timeZone: "Asia/Shanghai",
  });
  const sourceLabelsMap = options.sourceLabels ?? {};
  const activeSourceLabel =
    sourceLabelsMap[options.source] ??
    SOURCE_LABELS[options.source] ??
    options.source;
  const availableSources =
    options.availableSources && options.availableSources.length
      ? options.availableSources
      : [options.source];
  const sourceSelector =
    availableSources.length > 1
      ? `<div class="mt-4 flex flex-wrap items-center gap-2 text-sm">
          ${availableSources
            .map((src) => {
              const label =
                sourceLabelsMap[src] ??
                SOURCE_LABELS[src] ??
                src.toUpperCase();
              const isActive = src === options.source;
              const href = makeSourceLink(src);
              const baseClasses =
                "inline-flex items-center rounded-full px-3 py-1 transition border";
              const activeClasses =
                "border-sky-500 bg-sky-100 text-sky-800 dark:border-sky-300 dark:bg-sky-900/40 dark:text-sky-100";
              const inactiveClasses =
                "border-slate-200 text-slate-600 hover:border-slate-400 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-700";
              return `<a class="${baseClasses} ${
                isActive ? activeClasses : inactiveClasses
              }" href="${href}">${escapeHtml(label)}</a>`;
            })
            .join("")}
        </div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(activeSourceLabel)} Court Overview</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script>
      tailwind.config = { darkMode: "class" };
    </script>
    <style>
      * { box-sizing: border-box; }
      .slot-cell {
        display: grid;
        gap: 0.45rem;
        grid-template-columns: repeat(4, minmax(0, 1fr));
        grid-template-rows: repeat(2, minmax(0, 1fr));
      }
      .slot-badge {
        position: relative;
        display: inline-flex;
        justify-content: center;
        align-items: center;
        width: 100%;
        text-align: center;
        font-size: 0.52rem;
        line-height: 0.68rem;
        min-height: 1.05rem;
        border-radius: 0.4rem;
        padding: 0.1rem 0.22rem;
        border: 4px solid transparent;
      }
      .slot-badge .slot-label {
        font-size: 0.55rem;
      }
      .slot-badge.is-class {
        border-color: rgba(30, 41, 59, 0.85);
      }
      .dark .slot-badge.is-class {
        border-color: rgba(226, 232, 240, 0.85);
      }
      .slot-badge[data-activity]::after,
      .slot-badge[data-activity]::before {
        position: absolute;
        pointer-events: none;
        opacity: 0;
        transition: opacity 0.05s ease;
        z-index: 20;
      }
      .slot-badge[data-activity]::after {
        content: attr(data-activity);
        bottom: calc(100% + 0.35rem);
        left: 50%;
        transform: translateX(-50%);
        background: rgba(15, 23, 42, 0.92);
        color: #fff;
        padding: 0.25rem 0.35rem;
        border-radius: 0.35rem;
        font-size: 0.6rem;
        line-height: 0.75rem;
        max-width: 14rem;
        white-space: normal;
        text-align: center;
        box-shadow: 0 6px 16px rgba(15, 23, 42, 0.35);
      }
      .dark .slot-badge[data-activity]::after {
        background: rgba(226, 232, 240, 0.95);
        color: rgba(15, 23, 42, 0.9);
      }
      .slot-badge[data-activity]::before {
        content: "";
        bottom: calc(100% + 0.1rem);
        left: 50%;
        transform: translateX(-50%);
        border-width: 0.35rem;
        border-style: solid;
        border-color: rgba(15, 23, 42, 0.92) transparent transparent transparent;
      }
      .dark .slot-badge[data-activity]::before {
        border-color: rgba(226, 232, 240, 0.95) transparent transparent transparent;
      }
      .slot-badge[data-activity]:hover::after,
      .slot-badge[data-activity]:hover::before,
      .slot-badge[data-activity]:focus-visible::after,
      .slot-badge[data-activity]:focus-visible::before {
        opacity: 1;
      }
      .slot-empty {
        background: rgba(148, 163, 184, 0.35);
        color: rgb(100, 116, 139);
      }
      .dark .slot-empty {
        background: rgba(148, 163, 184, 0.18);
        color: rgb(148, 163, 184);
      }
      @media (min-width: 768px) {
        td[data-slot-cell] {
          width: 12.5rem;
        }
      }
      th.time-col {
        width: 7rem;
        min-width: 7rem;
        max-width: 7rem;
      }
      .theme-toggle,
      .compact-toggle {
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
      }
      .theme-toggle input,
      .compact-toggle input {
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
      .mobile-grid {
        display: none;
      }
      @media (max-width: 768px) {
        .desktop-table {
          display: none;
        }
        .mobile-grid {
          display: grid;
          gap: 1rem;
        }
      }
      /* Compact view overrides */
      .compact-mode td[data-slot-cell] {
        width: 6rem;
        padding: 0.12rem;
      }
      .compact-mode .slot-cell {
        gap: 0.12rem;
      }
      .compact-mode .slot-badge {
        font-size: 0.48rem;
        line-height: 0.55rem;
        min-height: 0.8rem;
        padding: 0.08rem 0.12rem;
        border-radius: 0.3rem;
      }
      .compact-mode .slot-badge .slot-label {
        display: none;
      }
    </style>
  </head>
  <body class="bg-slate-100 text-gray-900 transition-colors duration-300 dark:bg-slate-900 dark:text-slate-100">
    <div class="max-w-8xl mx-auto px-6 py-6 space-y-5">
      <section class="rounded-lg bg-white p-6 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
        <div class="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">📊 ${escapeHtml(activeSourceLabel)} Timeslot Dashboard</h1>
            <p class="text-sm text-slate-600 dark:text-slate-300">Live snapshot grouped by date and timeslot</p>
          </div>
          <div class="flex items-center gap-3 text-xs text-slate-600 dark:text-slate-300">
            <label class="compact-toggle">
              <input id="compact-toggle" type="checkbox" />
              <span class="toggle-track">
                <span class="toggle-thumb"></span>
              </span>
              <span class="toggle-label">
                <span class="toggle-label-dark">Detailed</span>
                <span class="toggle-label-light hidden">Compact</span>
              </span>
            </label>
            <label class="theme-toggle">
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
        </div>
        ${sourceSelector}
        <div class="mt-4 grid gap-2 text-sm text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          <p>⏱ Generated (UTC+8): <span class="font-medium text-slate-900 dark:text-slate-100">${generated}</span></p>
          <p>🧮 Total slots collected: <span class="font-medium text-slate-900 dark:text-slate-100">${slots.length}</span></p>
          <p>📡 Data source: <span class="font-medium text-slate-900 dark:text-slate-100">${escapeHtml(activeSourceLabel)}</span></p>
        </div>
      </section>

      ${
        tokenWarning && options.source === "usthing"
          ? `<section class="rounded-lg border border-amber-300 bg-amber-50/80 p-4 text-sm text-amber-800 shadow-sm dark:border-amber-500 dark:bg-amber-900/30 dark:text-amber-200">
              <h2 class="text-base font-semibold">⚠️ JWT token maintenance required</h2>
              <p class="mt-1">
                The latest API response indicates the USThing bearer JWT has expired. Please refresh the authorization token in your Worker configuration to restore data fetching.
              </p>
            </section>`
          : ""
      }

      <section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <h2 class="text-base font-semibold text-slate-800 dark:text-slate-100">🤝 Connect with me</h2>
        <p class="mt-1 text-sm text-slate-600 dark:text-slate-300">Curious about what I am building next? Follow along for behind-the-scenes updates and side projects.</p>
        <div class="mt-3 flex flex-wrap items-center gap-3 text-sm">
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

      <div class="desktop-table overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <table class="min-w-full table-fixed divide-y divide-slate-200 text-sm dark:divide-slate-700">
          <thead class="bg-slate-50 dark:bg-slate-700">
            <tr>
              <th class="time-col sticky left-0 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-700 dark:bg-slate-700 dark:text-slate-100">Time</th>
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
                          const entryMap = new Map(entries.map((slot) => [slot.FacilityID, slot]));

                          const badges = facilityOrder.map((facilityId) => {
                            const slot = entryMap.get(facilityId);
                            if (!slot) {
                              return `<span class="slot-badge slot-empty"><span class="slot-label">${resolveFacilityName(facilityId, options.source)}</span></span>`;
                            }
                            const colorClass = statusColor(slot.Status);
                            const facilityName = resolveFacilityName(slot.FacilityID, options.source);
                            const activity = slot.ActivityName?.trim() ?? "";
                            const isClass = activity.toLowerCase().includes("class");
                            const extraClass = isClass ? " is-class" : "";
                            const tooltipAttr = activity.length ? ` data-activity="${escapeHtml(activity)}"` : "";
                            return `<span class="slot-badge${extraClass} flex items-center rounded-md px-2 py-1 ${colorClass} dark:opacity-90"${tooltipAttr}>
                              <span class="slot-label">${facilityName}</span>
                            </span>`;
                          }).join("");

                          return `<td class="px-3 py-2" data-slot-cell>
                            <div class="slot-cell">${badges}</div>
                          </td>`;
                        })
                        .join("");

                      return `<tr class="text-slate-700 dark:text-slate-200">
                        <th class="time-col sticky left-0 bg-slate-50 px-3 py-2 text-left font-medium text-slate-700 font-mono dark:bg-slate-700 dark:text-slate-100">${label}</th>
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

      <div class="mobile-grid">
        ${
          datesToDisplay
            .map((date) => {
              const dateSlots = timeLabels.map(({ start, label }) => {
                const cells = slotsByDateTime.get(`${date}|${start}`) ?? [];
                return {
                  label,
                  slots: new Map(cells.map((slot) => [slot.FacilityID, slot])),
                };
              });

              return `<section class="rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-800">
                <header class="mb-3">
                  <h3 class="text-lg font-semibold text-slate-900 dark:text-slate-100">${date}</h3>
                </header>
                <div class="space-y-2">
                  ${dateSlots
                    .map(({ label, slots }) => {
                      const badges = facilityOrder.map((facilityId) => {
                        const slot = slots.get(facilityId);
                        if (!slot) {
                          return `<span class="slot-badge slot-empty"><span class="slot-label">${resolveFacilityName(facilityId, options.source)}</span></span>`;
                        }
                        const colorClass = statusColor(slot.Status);
                        const facilityName = resolveFacilityName(slot.FacilityID, options.source);
                        const activity = slot.ActivityName?.trim() ?? "";
                        const isClass = activity.toLowerCase().includes("class");
                        const extraClass = isClass ? " is-class" : "";
                        const tooltipAttr = activity.length ? ` data-activity="${escapeHtml(activity)}"` : "";
                        return `<span class="slot-badge${extraClass} flex items-center rounded-md px-2 py-1 text-xs ${colorClass} dark:opacity-90"${tooltipAttr}>
                          <span class="slot-label">${facilityName}</span>
                        </span>`;
                      }).join(" ");

                      return `<div class="rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-600">
                        <div class="mb-1 font-mono text-slate-600 dark:text-slate-300">${label}</div>
                        <div class="slot-cell">${badges}</div>
                      </div>`;
                    })
                    .join("")}
                </div>
              </section>`;
            })
            .join("")
        }
      </div>

      <footer class="mt-6 space-y-3 text-xs text-slate-500">
        <p>Status legend: <span class="inline-block h-3 w-3 rounded bg-green-500 align-middle"></span> Available · <span class="inline-block h-3 w-3 rounded bg-gray-400 align-middle"></span> Reserved · <span class="inline-block h-3 w-3 rounded bg-yellow-400 align-middle"></span> Maintenance / Cleaning · other states appear in light gray.</p>
      </footer>

      <aside class="rounded-lg border border-dashed border-indigo-300 bg-indigo-50/70 p-4 text-sm text-indigo-700 shadow-sm dark:border-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-200">
        <h3 class="mb-1 text-base font-semibold">🚧 Real-time alerts coming soon</h3>
        <p>
          Working on push notifications for instant timeslot updates. Stay tuned for the upcoming release if you'd like to receive live alerts when new slots open up.
        </p>
      </aside>
    </div>
    <script>
      (function () {
        const themeToggle = document.getElementById("theme-toggle");
        const compactToggle = document.getElementById("compact-toggle");
        if (!(themeToggle instanceof HTMLInputElement) || !(compactToggle instanceof HTMLInputElement)) return;
        const themeDarkLabel = document.querySelector(".theme-toggle .toggle-label-dark");
        const themeLightLabel = document.querySelector(".theme-toggle .toggle-label-light");
        const compactDarkLabel = document.querySelector(".compact-toggle .toggle-label-dark");
        const compactLightLabel = document.querySelector(".compact-toggle .toggle-label-light");
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const storedTheme = localStorage.getItem("usthing-theme");
        const storedCompact = localStorage.getItem("usthing-compact");
        const hour = ${options.generatedAt.getHours()};
        const timeBasedDefault = hour >= 19 || hour < 7 ? "dark" : "light";

        function applyTheme(theme, syncInput = true) {
          const root = document.documentElement;
          const body = document.body;
          if (theme === "dark") {
            root.classList.add("dark");
            body.classList.add("bg-slate-900", "text-slate-100");
            body.classList.remove("bg-slate-100", "text-gray-900");
            themeDarkLabel?.classList.add("hidden");
            themeLightLabel?.classList.remove("hidden");
            if (syncInput) themeToggle.checked = true;
          } else {
            root.classList.remove("dark");
            body.classList.add("bg-slate-100", "text-gray-900");
            body.classList.remove("bg-slate-900", "text-slate-100");
            themeDarkLabel?.classList.remove("hidden");
            themeLightLabel?.classList.add("hidden");
            if (syncInput) themeToggle.checked = false;
          }
        }

        function applyCompact(mode, syncInput = true) {
          const body = document.body;
          if (mode === "on") {
            body.classList.add("compact-mode");
            compactDarkLabel?.classList.add("hidden");
            compactLightLabel?.classList.remove("hidden");
            if (syncInput) compactToggle.checked = true;
          } else {
            body.classList.remove("compact-mode");
            compactDarkLabel?.classList.remove("hidden");
            compactLightLabel?.classList.add("hidden");
            if (syncInput) compactToggle.checked = false;
          }
        }

        const initialTheme = storedTheme ?? (prefersDark ? "dark" : timeBasedDefault);
        applyTheme(initialTheme);
        const initialCompact = storedCompact ?? "off";
        applyCompact(initialCompact);

        themeToggle.addEventListener("change", () => {
          const next = themeToggle.checked ? "dark" : "light";
          localStorage.setItem("usthing-theme", next);
          applyTheme(next, false);
        });

        compactToggle.addEventListener("change", () => {
          const next = compactToggle.checked ? "on" : "off";
          localStorage.setItem("usthing-compact", next);
          applyCompact(next, false);
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
