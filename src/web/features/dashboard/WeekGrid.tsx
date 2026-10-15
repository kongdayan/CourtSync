import { memo } from "react";
import { displayCourtName, getCopy, type Language } from "./i18n";
import { cellKey, type WeekCell, type WeekModel } from "./week-model";

export const WeekGrid = memo(function WeekGrid({ model, selectedKey, showCourts, onSelect, loading, language }: {
  model: WeekModel; selectedKey: string | null; showCourts: boolean;
  onSelect: (cell: WeekCell) => void; loading: boolean; language: Language;
}) {
  const t = getCopy(language);
  return <div className="week-table-wrap" aria-busy={loading}>
    <table className="week-table" aria-label={t.tableLabel}>
      <caption className="sr-only">{t.tableCaption}</caption>
      <thead><tr><th scope="col" className="time-heading">{t.time}</th>{model.days.map((day, index) =>
        <th key={day.date} scope="col" className={index === 0 ? "today-heading" : ""}>
          <span className="day-weekday">{index === 0 ? t.today : day.weekday}</span>
          <span className="day-date">{day.label}</span>
          <span className="day-count">{day.availableTimes ? t.daySlots(day.availableTimes) : "—"}</span>
        </th>)}</tr></thead>
      <tbody>{model.times.map((time, row) => <tr key={time}>
        <th scope="row" className="time-label">{time}</th>
        {model.days.map((day, column) => {
          const cell = model.cells.get(cellKey(day.date, time))!;
          const count = cell.available.length;
          const state = loading ? "loading" : cell.past ? "past" : !cell.hasData ? "unknown" : count ? "available" : "occupied";
          const label = loading ? t.loading : cell.past ? t.past : !cell.hasData ? t.noData : count ? t.availableCourts(count) : t.noCourts;
          return <td key={day.date}><button type="button" className={"week-cell cell-" + state + (count >= 10 ? " cell-many" : count >= 3 ? " cell-some" : "")}
            aria-label={t.cellDescription(day.date, cell.start, cell.end, label)}
            aria-pressed={selectedKey === cell.key} title={label + (count ? ": " + cell.available.map(c => displayCourtName(c.name, language)).join(language === "en" ? ", " : "、") : "")}
            data-cell={cell.key} disabled={loading} onClick={() => onSelect(cell)}
            onKeyDown={(event) => {
              const moves: Record<string, [number, number]> = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] };
              const move = moves[event.key];
              if (!move) return;
              event.preventDefault();
              const nextRow = Math.max(0, Math.min(model.times.length - 1, row + move[0]));
              const nextColumn = Math.max(0, Math.min(6, column + move[1]));
              const target = cellKey(model.days[nextColumn].date, model.times[nextRow]);
              const table = event.currentTarget.closest("table");
              table?.querySelector<HTMLButtonElement>('[data-cell="' + target + '"]')?.focus();
            }}>
            <span className="cell-count">{loading ? "·" : cell.past ? "·" : !cell.hasData ? "—" : count}</span>
            {showCourts && count > 0 && <span className="cell-courts">{cell.available.slice(0, 3).map(c => c.name.replace(/^羽毛球\s*/, "")).join(" / ")}{count > 3 ? " +" + (count - 3) : ""}</span>}
          </button></td>;
        })}
      </tr>)}</tbody>
    </table>
  </div>;
});
