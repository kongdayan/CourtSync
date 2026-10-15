import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, Moon, RefreshCw, Sun, X } from "lucide-react";
import { apiFetch } from "../../lib/api";
import type { DataSourceKey } from "../../../../ts/shared/sources";
import { SLOTS_CACHE_SECONDS, type SlotsResponse } from "../../../../ts/shared/slots";
import { getTodayUTC8 } from "../../../../ts/utils/time";
import { buildWeekModel, DURATIONS, type BookingDuration, type TimeBand, type WeekCell } from "./week-model";
import { displayCourtName, formatCollectedAt, formatSelectedDate, getCopy, type Language } from "./i18n";
import { downloadScheduleImage } from "./export-image";
import { WeekGrid } from "./WeekGrid";
import { SlotFinder } from "./SlotFinder";
import { defaultSearchFilters, findMatchingSlots } from "./slot-search";

function readPreference(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function savePreference(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* Private browsing can deny storage. */ }
}
function validSource(value: string | null): value is DataSourceKey { return value === "jiushi" || value === "usthing"; }
function useCompactLayout() {
  const [compact, setCompact] = useState(() => window.matchMedia?.("(max-width: 900px)").matches ?? window.innerWidth <= 900);
  useEffect(() => {
    const media = window.matchMedia?.("(max-width: 900px)");
    if (!media) return;
    const update = () => setCompact(media.matches);
    update();
    if (media.addEventListener) {
      media.addEventListener("change", update); return () => media.removeEventListener("change", update);
    }
    media.addListener(update); return () => media.removeListener(update);
  }, []);
  return compact;
}
function useVisibleClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const update = () => setNow(Date.now());
    const restart = () => {
      clearInterval(timer);
      if (document.visibilityState !== "hidden") { update(); timer = setInterval(update, 60_000); }
    };
    restart(); document.addEventListener("visibilitychange", restart);
    return () => { clearInterval(timer); document.removeEventListener("visibilitychange", restart); };
  }, []);
  return now;
}

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const [preferredSource] = useState<DataSourceKey>(() => {
    const saved = readPreference("courtsync-source"); return validSource(saved) ? saved : "jiushi";
  });
  const sourceParam = params.get("source");
  const source = validSource(sourceParam) ? sourceParam : preferredSource;
  const [language, setLanguage] = useState<Language>(() => readPreference("courtsync-language") === "en" ? "en" : "zh");
  const t = getCopy(language);
  const [duration, setDuration] = useState<BookingDuration>(1);
  const [band, setBand] = useState<TimeBand>("all");
  const [courtId, setCourtId] = useState("");
  const [showCourts, setShowCourts] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const compact = useCompactLayout();
  const [mobileDetailsOpen, setMobileDetailsOpen] = useState(false);
  const [desktopDetailsOpen, setDesktopDetailsOpen] = useState(true);
  const detailsOpen = compact ? mobileDetailsOpen : desktopDetailsOpen;
  const [searchFilters, setSearchFilters] = useState(defaultSearchFilters);
  const [dark, setDark] = useState(() => {
    const preference = readPreference("courtsync-theme");
    return preference ? preference === "dark" : document.documentElement.classList.contains("dark") || !!window.matchMedia?.("(prefers-color-scheme: dark)").matches;
  });
  const detailRef = useRef<HTMLElement>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const exportRef = useRef<HTMLDivElement>(null);
  const closeDetails = useCallback(() => {
    if (compact) setMobileDetailsOpen(false); else setDesktopDetailsOpen(false);
    requestAnimationFrame(() => {
      const trigger = detailTriggerRef.current;
      const target = trigger?.isConnected ? trigger : exportRef.current?.querySelector<HTMLElement>('.week-cell[aria-pressed="true"], .mobile-details-launcher, .details-toggle');
      target?.focus({ preventScroll: true });
    });
  }, [compact]);
  const now = useVisibleClock();
  const today = getTodayUTC8(new Date(now));
  const { data, isPending, error, isFetching, refetch } = useQuery<SlotsResponse>({
    queryKey: ["slots", source, today, 7],
    queryFn: ({ signal }) => apiFetch("/slots?source=" + source + "&days=7", { signal, credentials: "omit" }),
    staleTime: SLOTS_CACHE_SECONDS * 1000,
    refetchInterval: SLOTS_CACHE_SECONDS * 1000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: 1,
  });
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); savePreference("courtsync-theme", dark ? "dark" : "light"); }, [dark]);
  useEffect(() => { document.documentElement.lang = language === "en" ? "en" : "zh-CN"; savePreference("courtsync-language", language); }, [language]);
  useEffect(() => { savePreference("courtsync-source", source); setCourtId(""); setSelectedKey(null); }, [source]);
  const model = useMemo(() => buildWeekModel(data?.slots ?? [], source, today, now, duration, band, courtId, language), [data, source, today, now, duration, band, courtId, language]);
  const searchModel = useMemo(() => band === "all" ? model : buildWeekModel(data?.slots ?? [], source, today, now, duration, "all", courtId, language), [model, band, data, source, today, now, duration, courtId, language]);
  const searchMatches = useMemo(() => findMatchingSlots(searchModel, searchFilters), [searchModel, searchFilters]);
  const selected = selectedKey ? model.cells.get(selectedKey) : undefined;
  const stale = data?.sourceState === "stale" || (!!data?.lastSyncedAt && now - Date.parse(data.lastSyncedAt) > 120 * 60_000);
  const unavailable = data?.sourceState === "unavailable" || (!!data && !data.slots.length);
  const selectCell = useCallback((cell: WeekCell) => {
    if (isExporting) return;
    detailTriggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setSelectedKey(cell.key);
    if (compact) setMobileDetailsOpen(true);
    else setDesktopDetailsOpen(true);
  }, [isExporting, compact]);
  useEffect(() => {
    if (!detailsOpen) return;
    const body = detailRef.current?.querySelector<HTMLElement>(".detail-panel-body");
    if (body) body.scrollTop = 0;
    if (compact) detailRef.current?.querySelector<HTMLElement>(".detail-back-button, .finder-fields select")?.focus({ preventScroll: true });
  }, [detailsOpen, selectedKey, compact]);
  useEffect(() => {
    if (!detailsOpen) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      closeDetails();
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [detailsOpen, closeDetails]);
  const exportImage = async () => {
    if (!exportRef.current || isExporting) return;
    setExportError(false); setIsExporting(true);
    try {
      await downloadScheduleImage(exportRef.current, "courtsync-" + source + "-" + today + "-" + duration + "h-" + language + ".png");
    } catch (failure) {
      console.error("Schedule image export failed", failure); setExportError(true);
    } finally { setIsExporting(false); }
  };

  return <main className="court-dashboard" lang={language === "en" ? "en" : "zh-CN"}>
    <div className="court-shell" ref={exportRef} data-exporting={isExporting || undefined}>
      <header className="court-header">
        <Link to="/" className="court-brand" aria-label={t.home}><span className="brand-mark" aria-hidden="true">CS</span>CourtSync<span className="brand-tag">{t.brandTag}</span></Link>
        <div className="header-actions" data-export-ignore>
          <button className="language-button" aria-label={t.language} title={t.language} disabled={isExporting} onClick={() => setLanguage(value => value === "zh" ? "en" : "zh")}>{language === "zh" ? "EN" : "中文"}</button>
          <button className="icon-button" aria-label={dark ? t.lightTheme : t.darkTheme} title={dark ? t.lightTheme : t.darkTheme} disabled={isExporting} onClick={() => setDark(d => !d)}>{dark ? <Sun size={18} /> : <Moon size={18} />}</button>
        </div>
      </header>

      <div className="overview-heading"><div><p className="eyebrow">{t.eyebrow}</p><h1>{t.heading}</h1><p className="intro">{t.intro}</p></div>
        <div className="week-summary"><strong>{isPending ? "—" : model.availableTimes}<span>{t.availableTimes}</span></strong><span>{model.days[0].label} — {model.days[6].label}<small>{t.timezone}</small></span></div>
      </div>

      <section className="planner" aria-label={t.planner}>
        <div className="planner-toolbar">
          <div className="source-tabs" aria-label={t.sources}>{(["jiushi", "usthing"] as const).map(key => <button key={key} aria-pressed={source === key} disabled={isExporting} onClick={() => { const next = new URLSearchParams(params); next.set("source", key); setParams(next); }}>{t.sourceTabs[key]}</button>)}</div>
          <div className="planner-filters">
            <label className="select-field"><span>{t.duration}</span><select aria-label={t.durationLabel} value={duration} disabled={isExporting} onChange={e => setDuration(Number(e.target.value) as BookingDuration)}>{DURATIONS.map(value => <option key={value} value={value}>{t.hours(value)}</option>)}</select></label>
            <label className="select-field"><span>{t.time}</span><select aria-label={t.timeLabel} value={band} disabled={isExporting} onChange={e => setBand(e.target.value as TimeBand)}><option value="all">{t.allDay}</option><option value="evening">{t.evening}</option></select></label>
            <label className="select-field court-filter"><span>{t.court}</span><select aria-label={t.courtLabel} value={courtId} disabled={isExporting} onChange={e => setCourtId(e.target.value)}><option value="">{t.allCourts}</option>{model.courts.map(c => <option value={c.id} key={c.id}>{displayCourtName(c.name, language)}</option>)}</select></label>
          </div>
          <div className="toolbar-actions" data-export-ignore><button className="download-button" aria-label={t.download} title={t.download} disabled={!model.filteredSlots.length || isExporting} onClick={() => { void exportImage(); }}>{isExporting ? <RefreshCw size={15} className="refresh-spin" /> : <ArrowDownToLine size={17} />}<span>{t.downloadShort}</span></button><button className="refresh-button" aria-label={isFetching ? t.checking : t.check} title={t.check} disabled={isFetching || isExporting} onClick={() => { void refetch(); }}><RefreshCw size={15} className={isFetching ? "refresh-spin" : ""} /><span>{isFetching ? t.checking : t.check}</span></button></div>
        </div>
        {(isExporting || exportError) && <p className="export-status" role="status" data-export-ignore>{exportError ? t.exportError : t.exporting}</p>}
        <div className="source-meta"><div><span className={"status-dot" + (stale || unavailable || error ? " status-warning" : "")} /><strong>{t.sourceNames[source]}</strong><span>{model.courts.length ? t.courts(model.courts.length) : ""}</span></div><span>{t.collected} {formatCollectedAt(data?.lastSyncedAt ?? data?.lastUpdatedAt, language)}</span></div>
        {(error || stale || unavailable) && <div className="source-alert" role="status">{error ? (data ? t.snapshotRetained : t.snapshotError) : unavailable ? t.sourceUnavailable : t.sourceStale}</div>}

        <div className={"planner-content" + (compact ? " compact-layout" : "") + (detailsOpen ? " has-details" : "")}>
          <section className="week-board" aria-label={t.week}>
            <div className="board-heading"><h2>{t.week}</h2><div className="board-controls" data-export-ignore><label className="court-label-toggle"><input type="checkbox" checked={showCourts} disabled={isExporting} onChange={e => setShowCourts(e.target.checked)} />{t.showCourts}</label>{!compact && <button className="details-toggle" aria-controls="court-details-panel" aria-expanded={detailsOpen} onClick={() => setDesktopDetailsOpen(value => !value)}>{detailsOpen ? t.hideDetails : t.showDetails}</button>}</div></div>
            <WeekGrid model={model} selectedKey={selectedKey} showCourts={showCourts} onSelect={selectCell} loading={isPending} language={language} />
            <div className="grid-legend"><span><i className="legend-available" />{t.legendAvailable}</span><span><i className="legend-occupied" />{t.legendOccupied}</span><span>{t.legendUnknown}</span><span>{t.legendPast}</span></div>
            <p className="grid-note">{t.durationNote(duration)} {t.gridHelp}</p>
          </section>

          {detailsOpen && <aside className="slot-detail" id="court-details-panel" ref={detailRef} role={compact ? "dialog" : undefined} aria-modal={compact ? false : undefined} aria-label={t.detail} aria-live="polite">
            <div className="detail-panel-header" data-export-ignore>{selected
              ? <button className="detail-back-button" onClick={() => setSelectedKey(null)}><ArrowLeft size={17} />{t.backToFilters}</button>
              : <span>{t.findTimes}</span>}<button className="icon-button" aria-label={t.closePanel} onClick={closeDetails}><X size={20} /></button></div>
            <div className="detail-panel-body">
            {selected ? <><div className="detail-eyebrow"><span>{t.chosen}</span></div>
              <h2>{formatSelectedDate(selected.date, language)} <span>{model.days.find(d => d.date === selected.date)?.weekday}</span></h2><p className="detail-time">{selected.start}<span>—</span>{selected.end}</p>
              <p className="detail-count">{selected.past ? t.started : !selected.hasData ? t.unknownTime : selected.available.length ? <strong>{t.availableCourts(selected.available.length)}</strong> : t.unavailableTime}</p>
              {!!selected.available.length && <ul className="court-list">{selected.available.map(c => <li key={c.id}><span>{displayCourtName(c.name, language)}</span><span className="court-free">{t.free}</span></li>)}</ul>}
              <div className="booking-note"><strong>{t.book}</strong><p>{t.bookingHelp[source]}</p><small>{t.bookingDisclaimer}</small></div>
            </> : <SlotFinder model={searchModel} matches={searchMatches} filters={searchFilters} onFiltersChange={setSearchFilters} duration={duration} onDurationChange={setDuration} onSelect={cell => { setBand("all"); selectCell(cell); }} language={language} loading={isPending} unavailable={unavailable || !!error && !data} />}
            </div>
            <div className={"detail-panel-footer" + (!selected ? " finder-footer" : "")} data-export-ignore><button className="detail-overview-button" onClick={closeDetails}><ArrowLeft size={16} />{t.backToOverview}</button>{!selected && <button className="finder-result-button" disabled={isPending || unavailable || !searchMatches.length} onClick={() => {
              const body = detailRef.current?.querySelector<HTMLElement>(".detail-panel-body");
              const results = body?.querySelector<HTMLElement>(".finder-results");
              if (body && results) { body.scrollTop += results.getBoundingClientRect().top - body.getBoundingClientRect().top - 12; results.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true }); }
            }}>{t.viewMatches(searchMatches.length)}<ArrowUpRight size={15} /></button>}</div>
          </aside>}
        </div>
        <footer className="planner-footer"><span className={isFetching ? "checking" : ""} aria-live="polite">{isFetching ? t.checkingSnapshot : t.polling}</span><span>{t.collectionSchedule}</span></footer>
      </section>
      <section className="court-promotion" aria-label={t.promotionLabel}><div><h2>{t.promotionTitle}</h2><p>{t.promotionBody}</p></div><div className="promotion-links">
        <a href="https://x.com/Kook91513056" target="_blank" rel="noopener noreferrer">X · @Kook91513056 <ArrowUpRight size={14} /></a>
        <a href="https://github.com/kongdayan" target="_blank" rel="noopener noreferrer">GitHub · @kongdayan <ArrowUpRight size={14} /></a>
      </div></section>
      <footer className="court-footer"><span>{t.footer}</span><a href="https://sports.anserlabs.com/">sports.anserlabs.com</a></footer>
      {compact && !detailsOpen && <button className="mobile-details-launcher" data-export-ignore aria-controls="court-details-panel" aria-expanded={false} onClick={event => { detailTriggerRef.current = event.currentTarget; setMobileDetailsOpen(true); }}>{selected ? t.showDetails : t.findTimes}<ArrowUpRight size={15} /></button>}
    </div>
  </main>;
}
