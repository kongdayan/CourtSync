import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { displayCourtName, getCopy, type Language } from "./i18n";
import { DURATIONS, timeOf, type BookingDuration, type WeekCell, type WeekModel } from "./week-model";
import { validSearchWindow, weekdayOf, type SlotSearchFilters } from "./slot-search";

const times = Array.from({ length: 49 }, (_, index) => timeOf(index * 30));
const presets = [
  { key: "allDay", start: "08:00", end: "22:00" },
  { key: "morning", start: "08:00", end: "12:00" },
  { key: "afternoon", start: "12:00", end: "18:00" },
  { key: "eveningShort", start: "18:00", end: "22:00" },
] as const;

export function SlotFinder({ model, matches, filters, onFiltersChange, duration, onDurationChange, onSelect, language, loading, unavailable }: {
  matches: WeekCell[];
  model: WeekModel; filters: SlotSearchFilters; onFiltersChange: (filters: SlotSearchFilters) => void;
  duration: BookingDuration; onDurationChange: (duration: BookingDuration) => void;
  onSelect: (cell: WeekCell) => void; language: Language; loading: boolean; unavailable: boolean;
}) {
  const t = getCopy(language);
  const [customPreset, setCustomPreset] = useState(false);
  const [extraResults, setExtraResults] = useState({ key: "", count: 0 });
  const resultKey = [filters.start, filters.end, filters.weekdays.join(","), duration, model.courts.map(c => c.id).join(","), model.availableTimes].join("|");
  const visibleCount = 12 + (extraResults.key === resultKey ? extraResults.count : 0);
  const preset = customPreset ? "custom" : presets.find(value => value.start === filters.start && value.end === filters.end)?.key ?? "custom";
  const selectedDays = model.days.filter(day => filters.weekdays.includes(weekdayOf(day.date)));

  return <section className="slot-finder" aria-label={t.findTimes}>
    <h2>{t.findHeading}</h2><p className="finder-intro">{t.findHelp}</p>
    <div className="finder-fields" data-export-ignore>
      <label className="select-field"><span>{t.timePreset}</span><select aria-label={t.timePreset} value={preset} onChange={event => {
        setCustomPreset(event.target.value === "custom");
        const value = presets.find(item => item.key === event.target.value);
        if (value) onFiltersChange({ ...filters, start: value.start, end: value.end });
      }}>{presets.map(value => <option key={value.key} value={value.key}>{t[value.key]}</option>)}<option value="custom">{t.customTime}</option></select></label>
      <label className="select-field"><span>{t.duration}</span><select aria-label={t.findDuration} value={duration} onChange={event => onDurationChange(Number(event.target.value) as BookingDuration)}>{DURATIONS.map(value => <option key={value} value={value}>{t.hours(value)}</option>)}</select></label>
      <label className="select-field"><span>{t.startTime}</span><select aria-label={t.startTime} value={filters.start} onChange={event => { setCustomPreset(true); onFiltersChange({ ...filters, start: event.target.value }); }}>{times.slice(0, -1).map(time => <option key={time}>{time}</option>)}</select></label>
      <label className="select-field"><span>{t.endTime}</span><select aria-label={t.endTime} value={filters.end} onChange={event => { setCustomPreset(true); onFiltersChange({ ...filters, end: event.target.value }); }}>{times.slice(1).map(time => <option key={time}>{time}</option>)}</select></label>
    </div>
    <fieldset className="finder-days" data-export-ignore><legend>{t.weekdays}</legend><div className="finder-day-actions">
      <button type="button" onClick={() => onFiltersChange({ ...filters, weekdays: [0, 1, 2, 3, 4, 5, 6] })}>{t.allDays}</button>
      <button type="button" onClick={() => onFiltersChange({ ...filters, weekdays: [1, 2, 3, 4, 5] })}>{t.workdays}</button>
      <button type="button" onClick={() => onFiltersChange({ ...filters, weekdays: [0, 6] })}>{t.weekend}</button>
    </div><div className="finder-day-options">{model.days.map(day => {
      const weekday = weekdayOf(day.date), checked = filters.weekdays.includes(weekday);
      return <label key={day.date} className={checked ? "is-selected" : ""}><input type="checkbox" checked={checked} aria-label={day.weekday + " " + day.label} onChange={() => onFiltersChange({ ...filters, weekdays: checked ? filters.weekdays.filter(value => value !== weekday) : [...filters.weekdays, weekday] })} /><span>{day.weekday}</span><small>{day.label}</small></label>;
    })}</div></fieldset>
    <p className="finder-summary">{filters.start}–{filters.end} · {t.hours(duration)} · {selectedDays.length === 7 ? t.allDays : selectedDays.map(day => day.weekday).join(" / ") || t.noDays}</p>
    <div className="finder-results" aria-live="polite">
      <h3 tabIndex={-1}>{t.matchCount(matches.length)}</h3>
      {loading || unavailable || !validSearchWindow(filters) || !filters.weekdays.length || !matches.length
        ? <p className="no-suggestions">{loading ? t.loadingCourts : unavailable ? t.waiting : !validSearchWindow(filters) ? t.invalidTimeWindow : !filters.weekdays.length ? t.chooseDays : t.noMatches}</p>
        : <ul className="slot-matches">{matches.slice(0, visibleCount).map(cell => {
          const day = model.days.find(value => value.date === cell.date)!;
          return <li key={cell.key}><button type="button" className="slot-match" aria-label={t.matchAction(day.label, day.weekday, cell.start, cell.end, cell.available.length)} onClick={() => onSelect(cell)}>
            <span className="match-main"><strong>{day.weekday} <span>{day.label}</span></strong><span>{cell.start}–{cell.end}</span><small>{cell.available.slice(0, 3).map(c => displayCourtName(c.name, language)).join(" · ")}{cell.available.length > 3 ? " +" + (cell.available.length - 3) : ""}</small></span>
            <span className="suggestion-count">{t.courtsShort(cell.available.length)}<ArrowUpRight size={15} /></span>
          </button></li>;
        })}</ul>}
      {matches.length > visibleCount && <button type="button" className="finder-more" data-export-ignore onClick={() => setExtraResults({ key: resultKey, count: visibleCount })}>{t.moreMatches(matches.length - visibleCount)}</button>}
    </div>
  </section>;
}
