// Wall-clock helpers for Kyiv and NL time (the Worker itself runs in UTC).
export const NL_TIMEZONE = "Europe/Amsterdam";
export const KYIV_TIMEZONE = "Europe/Kyiv";
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

// Wall-clock date and time of a moment in a time zone
export function zonedParts(moment, timeZone) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(moment);
  const value = (type) => Number(parts.find((part) => part.type === type).value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute") };
}

function offsetMinutes(utcMillis, timeZone) {
  const wall = zonedParts(new Date(utcMillis), timeZone);
  const wallAsUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute);
  return Math.round((wallAsUtc - utcMillis) / MINUTE);
}

// The moment when the clock in `timeZone` shows this date and time (minute may be 1440 = next midnight)
export function zonedTimeToDate(day, hour, minute, timeZone) {
  const wallAsUtc = Date.UTC(day.year, day.month - 1, day.day, hour, minute);
  let utc = wallAsUtc - offsetMinutes(wallAsUtc, timeZone) * MINUTE;
  // Near a summer/winter time switch the first guess can be one hour off
  utc = wallAsUtc - offsetMinutes(utc, timeZone) * MINUTE;
  return new Date(utc);
}

export function addDays(day, days) {
  const moved = new Date(Date.UTC(day.year, day.month - 1, day.day + days));
  return { year: moved.getUTCFullYear(), month: moved.getUTCMonth() + 1, day: moved.getUTCDate() };
}

// "2026-11-06" <-> { year, month, day }
export function dayKey(day) {
  return `${day.year}-${String(day.month).padStart(2, "0")}-${String(day.day).padStart(2, "0")}`;
}

export function parseDayKey(key) {
  const [year, month, day] = key.split("-").map(Number);
  return { year, month, day };
}

export function kyivDay(moment) {
  const { year, month, day } = zonedParts(moment, KYIV_TIMEZONE);
  return { year, month, day };
}
