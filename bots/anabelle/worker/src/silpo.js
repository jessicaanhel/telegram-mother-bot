// Same logic as bots/anabelle/commands/silpo/silpo_slots.py: keep both in sync.
import { KYIV_TIMEZONE, MINUTE, NL_TIMEZONE, addDays, zonedParts, zonedTimeToDate } from "./time_zones.js";

// Silpo delivery slots, as the Silpo app shows them (NL time)
export const SLOTS = [
  "8:00-9:30", "9:30-11:00", "11:00-12:30",
  "12:30-14:00", "14:00-15:30", "15:30-17:00",
  "17:00-18:30", "18:30-20:00", "20:00-21:30",
];

const SLOT_PATTERN = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

/**
 * Convert an NL slot like "18:30-20:00" to the start and end moments.
 * A slot that has already ended today is taken as tomorrow's.
 */
export function slotMoments(slot, now) {
  const match = SLOT_PATTERN.exec(slot);
  if (!match) {
    throw new Error(`Not a Silpo slot: ${slot}`);
  }
  const [startHour, startMinute, endHour, endMinute] = match.slice(1).map(Number);

  let nlDay = zonedParts(now, NL_TIMEZONE);
  let end = zonedTimeToDate(nlDay, endHour, endMinute, NL_TIMEZONE);
  if (end <= now) {
    nlDay = addDays(nlDay, 1);
    end = zonedTimeToDate(nlDay, endHour, endMinute, NL_TIMEZONE);
  }
  return { start: zonedTimeToDate(nlDay, startHour, startMinute, NL_TIMEZONE), end };
}

function kyivTime(moment) {
  const { hour, minute } = zonedParts(moment, KYIV_TIMEZONE);
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function kyivDateKey(moment) {
  const { year, month, day } = zonedParts(moment, KYIV_TIMEZONE);
  return year * 10000 + month * 100 + day;
}

// "протягом наступних 21 години", but "3 годин", "11 годин"
function genitive(number, one, many) {
  return number % 10 === 1 && number % 100 !== 11 ? `${number} ${one}` : `${number} ${many}`;
}

export function durationText(minutes) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  const parts = [];
  if (hours) {
    parts.push(genitive(hours, "години", "годин"));
  }
  if (rest || !hours) {
    parts.push(genitive(rest, "хвилини", "хвилин"));
  }
  return parts.join(" ");
}

/** The sentence the tablet reads out, in Kyiv time. */
export function courierMessage(slot, now) {
  const { start, end } = slotMoments(slot, now);
  const day = kyivDateKey(start) > kyivDateKey(now) ? "завтра " : "";
  const minutesToEnd = Math.floor((end - now) / MINUTE);
  return (
    `Кур'єр Сільпо буде ${day}між ${kyivTime(start)} та ${kyivTime(end)}. ` +
    `Це протягом наступних ${durationText(minutesToEnd)}.`
  );
}
