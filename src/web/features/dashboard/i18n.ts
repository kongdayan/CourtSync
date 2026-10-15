import type { DataSourceKey } from "../../../../ts/shared/sources";
export type Language = "zh" | "en";

const zh = {
  home: "CourtSync 首页", brandTag: "场地雷达", language: "Switch to English",
  lightTheme: "切换白天模式", darkTheme: "切换夜间模式", eyebrow: "找到下一场球的时间",
  heading: "未来七天，一眼看全。", intro: "选一个时间，查看可用场地。数字就是空闲场地数。",
  availableTimes: "有场时段", timezone: "北京时间 UTC+8", planner: "场地查询", sources: "数据源",
  sourceTabs: { jiushi: "久事体育", usthing: "港科大" },
  sourceNames: { jiushi: "上海万体汇羽毛球馆", usthing: "香港科技大学" },
  duration: "时长", durationLabel: "连续预约时长", time: "时间", timeLabel: "时段筛选", allDay: "全天", evening: "18 点后",
  court: "场地", courtLabel: "场地筛选", allCourts: "全部场地", download: "下载当前场次图片", downloadShort: "图片",
  exporting: "正在生成图片…", exportError: "图片生成失败，请重试。", check: "刷新", checking: "检查中",
  collected: "采集于", neverCollected: "尚未采集成功", week: "七天总览", showCourts: "显示场地号",
  snapshotError: "暂时无法读取场地快照，请稍后重试。", snapshotRetained: "最新快照检查失败，保留上次数据。稍后会自动重试。",
  sourceUnavailable: "该数据源暂不可用，暂无采集数据。", sourceStale: "正在显示上次成功采集的数据，请在预约前核对小程序。",
  tableLabel: "未来七天场地可用情况", tableCaption: "数字表示该时段可用的场地数量。点击查看场地，方向键移动到相邻时段。",
  today: "今天", loading: "加载中", past: "已开始", noData: "暂无数据", noCourts: "无可用场地",
  legendAvailable: "数字：可用场地", legendOccupied: "0：无可用", legendUnknown: "—：暂无数据", legendPast: "·：已开始",
  gridHelp: "点击数字查看具体场地。", detail: "时段详情", chosen: "你选择的时段", closeDetail: "关闭时段详情",
  showDetails: "查看详情", hideDetails: "收起详情", closePanel: "关闭详情面板",
  backToOverview: "返回七天总览", backToFilters: "返回时段筛选", findTimes: "找合适的时段", findHeading: "什么时候方便打球？",
  findHelp: "查找同一块场地连续空闲的时段，使用上方选择的场地。",
  timePreset: "常用时间段", morning: "上午", afternoon: "下午", eveningShort: "晚上", customTime: "自定义时间",
  startTime: "最早开始", endTime: "最晚结束", findDuration: "查找连续时长", weekdays: "周几 · 可多选",
  allDays: "每天", workdays: "工作日", weekend: "周末", noDays: "未选择日期", chooseDays: "请至少选择一天。",
  invalidTimeWindow: "最晚结束时间需要晚于最早开始时间。", noMatches: "没有符合条件的场地，可扩大时间范围或缩短时长。",
  matchCount: (n: number) => n + " 个合适时段", moreMatches: (n: number) => "显示更多（剩余 " + n + " 个）",
  viewMatches: (n: number) => "查看 " + n + " 个时段",
  matchAction: (date: string, day: string, start: string, end: string, count: number) => "查看 " + date + " " + day + " " + start + "–" + end + " 的 " + count + " 块场地",
  started: "该时段已经开始", unknownTime: "该时段暂无采集数据", unavailableTime: "该时段无可用场地", free: "空闲",
  book: "前往小程序预约", bookingHelp: {
    jiushi: "微信打开「久事体育」，进入上海万体汇羽毛球馆，选择上面的日期、时间和场地。",
    usthing: "打开 USThing，在设施预约中选择相同的日期、时间和场地。",
  }, bookingDisclaimer: "余位可能随时变化，请以小程序确认页为准。",
  startHere: "从这里开始", detailHeading: "什么时候打一场？", detailIntro: "点击表格里的任意时段，具体场地会显示在这里。",
  next: "最近可约", loadingCourts: "正在加载场地…", waiting: "等待数据源恢复后显示。", noSuggestions: "当前筛选下暂无可约时段。",
  durationTip: "想多打几小时？可选择 1–6 小时，会自动检查同一场地是否连续空闲。",
  polling: "页面每 5 分钟检查快照 · 隐藏时暂停", checkingSnapshot: "正在检查最新快照…",
  collectionSchedule: "数据源 08:00–22:00 每小时整点采集 · 预约以小程序为准",
  promotionLabel: "关注我的项目", promotionTitle: "🤝 关注我的项目与近况",
  promotionBody: "想知道我接下来在做什么？关注我的账号，了解项目进展、幕后故事和新作品。",
  footer: "CourtSync · 为下一场球留出时间",
  hours: (n: number) => n + " 小时", courts: (n: number) => n + " 块场地", courtsShort: (n: number) => n + " 块",
  availableCourts: (n: number) => n + " 块场地可用", daySlots: (n: number) => n + " 时段",
  durationNote: (n: number) => n === 1 ? "每格对应 1 小时。" : "已筛选同一块场地连续空闲 " + n + " 小时的时段。",
  cellDescription: (date: string, start: string, end: string, state: string) => date + " " + start + " 至 " + end + "，" + state,
};
const en: typeof zh = {
  home: "CourtSync home", brandTag: "Court radar", language: "切换为中文",
  lightTheme: "Switch to day mode", darkTheme: "Switch to night mode", eyebrow: "Make time for your next game",
  heading: "Seven days. One view.", intro: "Pick a time. Numbers show available courts.",
  availableTimes: "open times", timezone: "Beijing time · UTC+8", planner: "Court availability", sources: "Data source",
  sourceTabs: { jiushi: "Jiushi", usthing: "HKUST" },
  sourceNames: { jiushi: "Shanghai Wantihui Badminton Centre", usthing: "Hong Kong University of Science and Technology" },
  duration: "Duration", durationLabel: "Continuous booking duration", time: "Time", timeLabel: "Time filter", allDay: "All day", evening: "After 18:00",
  court: "Court", courtLabel: "Court filter", allCourts: "All courts", download: "Download current schedule image", downloadShort: "PNG",
  exporting: "Creating image…", exportError: "Could not create the image. Please try again.", check: "Refresh", checking: "Checking",
  collected: "Collected", neverCollected: "No successful collection yet", week: "Seven-day overview", showCourts: "Court numbers",
  snapshotError: "The court snapshot is unavailable. Please try again later.", snapshotRetained: "The latest check failed. Keeping the previous data and retrying later.",
  sourceUnavailable: "This data source is unavailable. No collected data to display.", sourceStale: "Showing the last successful collection. Check the mini program before booking.",
  tableLabel: "Court availability for the next seven days", tableCaption: "Numbers show available courts. Select a time to see courts. Use arrow keys to move between times.",
  today: "Today", loading: "Loading", past: "Started", noData: "No data", noCourts: "No available courts",
  legendAvailable: "Number: available", legendOccupied: "0: unavailable", legendUnknown: "—: no data", legendPast: "·: started",
  gridHelp: "Select a number to see the courts.", detail: "Time details", chosen: "Your selected time", closeDetail: "Close time details",
  showDetails: "View details", hideDetails: "Hide details", closePanel: "Close details panel",
  backToOverview: "Back to overview", backToFilters: "Back to time filters", findTimes: "Find a time", findHeading: "When can you play?",
  findHelp: "Find continuous openings on the court selected above.",
  timePreset: "Time of day", morning: "Morning", afternoon: "Afternoon", eveningShort: "Evening", customTime: "Custom time",
  startTime: "Earliest start", endTime: "Latest finish", findDuration: "Search duration", weekdays: "Days · select any",
  allDays: "Every day", workdays: "Weekdays", weekend: "Weekend", noDays: "No days selected", chooseDays: "Choose at least one day.",
  invalidTimeWindow: "Latest finish must be later than earliest start.", noMatches: "No courts match. Try a wider time window or a shorter duration.",
  matchCount: n => n + (n === 1 ? " matching time" : " matching times"), moreMatches: n => "Show more (" + n + " remaining)",
  viewMatches: n => "View " + n + (n === 1 ? " match" : " matches"),
  matchAction: (date, day, start, end, count) => "View " + count + (count === 1 ? " court" : " courts") + " on " + day + " " + date + ", " + start + "–" + end,
  started: "This time has already started", unknownTime: "No collected data for this time", unavailableTime: "No available courts at this time", free: "Free",
  book: "Book in the mini program", bookingHelp: {
    jiushi: "Open Jiushi Sports in WeChat, find Shanghai Wantihui Badminton Centre, then select the date, time and court shown above.",
    usthing: "Open USThing and select the same date, time and court in facility bookings.",
  }, bookingDisclaimer: "Availability can change. Confirm it in the mini program before booking.",
  startHere: "Start here", detailHeading: "When is your next game?", detailIntro: "Select any time in the table to see the available courts here.",
  next: "Next available", loadingCourts: "Loading courts…", waiting: "Available times will appear when the source recovers.", noSuggestions: "No available times match these filters.",
  durationTip: "Want a longer game? Choose 1–6 hours to find a continuous opening on the same court.",
  polling: "Page checks snapshots every 5 min · pauses when hidden", checkingSnapshot: "Checking the latest snapshot…",
  collectionSchedule: "Source collected hourly, 08:00–22:00 · confirm in the mini program",
  promotionLabel: "Follow my projects", promotionTitle: "🤝 Connect with me",
  promotionBody: "Curious about what I am building next? Follow along for behind-the-scenes updates and side projects.",
  footer: "CourtSync · Make time for your next game",
  hours: n => n + (n === 1 ? " hour" : " hours"), courts: n => n + (n === 1 ? " court" : " courts"), courtsShort: n => n + (n === 1 ? " court" : " courts"),
  availableCourts: n => n + (n === 1 ? " court available" : " courts available"), daySlots: n => n + (n === 1 ? " time" : " times"),
  durationNote: n => n === 1 ? "Each cell covers 1 hour." : "Showing " + n + " continuous hours on the same court.",
  cellDescription: (date, start, end, state) => date + " " + start + " to " + end + ", " + state,
};
export const getCopy = (language: Language) => language === "en" ? en : zh;
export function displayCourtName(name: string, language: Language): string {
  return language === "en" ? name.replace(/^羽毛球\s*/, "Court ") : name;
}
export function sourceName(source: DataSourceKey, language: Language): string { return getCopy(language).sourceNames[source]; }
export function formatCollectedAt(value: string | null | undefined, language: Language): string {
  return value ? new Date(value).toLocaleString(language === "en" ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }) : getCopy(language).neverCollected;
}
export function formatSelectedDate(date: string, language: Language): string {
  return new Date(date + "T00:00:00+08:00").toLocaleDateString(language === "en" ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai", month: language === "en" ? "short" : "long", day: "numeric" });
}
