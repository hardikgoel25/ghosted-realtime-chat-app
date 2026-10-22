import {
  differenceInMinutes,
  format,
  formatDistanceToNowStrict,
  isSameDay,
  isSameYear,
  isToday,
  isYesterday,
} from "date-fns";

const asDate = (value) => (value instanceof Date ? value : new Date(value));

export function timeOf(value) {
  return format(asDate(value), "HH:mm");
}

/** "Today", "Yesterday", "Tuesday, 3 June" or "3 June 2025" */
export function dayLabel(value, now = new Date()) {
  const date = asDate(value);
  if (isToday(date)) return "Today";
  if (isYesterday(date)) return "Yesterday";
  return format(date, isSameYear(date, now) ? "EEEE, d MMMM" : "d MMMM yyyy");
}

/** Compact timestamp for list rows: time today, "Yesterday", weekday within a week, else date */
export function listTime(value, now = new Date()) {
  const date = asDate(value);
  if (isToday(date)) return format(date, "HH:mm");
  if (isYesterday(date)) return "Yesterday";
  const days = (now.getTime() - date.getTime()) / 86_400_000;
  if (days < 7) return format(date, "EEE");
  return format(date, isSameYear(date, now) ? "d MMM" : "dd/MM/yy");
}

export function lastSeenLabel(value, now = new Date()) {
  if (!value) return "Offline";
  const date = asDate(value);
  const minutes = differenceInMinutes(now, date);
  if (minutes < 1) return "Last seen just now";
  if (minutes < 60) return `Last seen ${minutes} min ago`;
  if (isToday(date)) return `Last seen today at ${format(date, "HH:mm")}`;
  if (isYesterday(date)) return `Last seen yesterday at ${format(date, "HH:mm")}`;
  return `Last seen ${format(date, isSameYear(date, now) ? "d MMM" : "d MMM yyyy")}`;
}

export function relativeTime(value) {
  return formatDistanceToNowStrict(asDate(value), { addSuffix: true });
}

export function sameDay(a, b) {
  return isSameDay(asDate(a), asDate(b));
}

export function minutesBetween(a, b) {
  return Math.abs(differenceInMinutes(asDate(a), asDate(b)));
}

export function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
