// Silpo courier: you pick the delivery slot (NL time, as the Silpo app shows it) and when it is,
// Anabelle sends one sentence in Kyiv time to the tablet.
import { KYIV_TIMEZONE, NL_TIMEZONE, addDays, zonedParts, zonedTimeToDate } from "./time_zones.js";

// Silpo delivery slots, as the Silpo app shows them (NL time)
export const SLOTS = [
  "8:00-9:30", "9:30-11:00", "11:00-12:30",
  "12:30-14:00", "14:00-15:30", "15:30-17:00",
  "17:00-18:30", "18:30-20:00", "20:00-21:30",
];

// Second question after the slot: when it is. You choose, nothing is calculated.
export const WHEN_OPTIONS = {
  "1": { button: "Протягом години", sentence: "Це протягом години." },
  "2": { button: "Протягом 2 годин", sentence: "Це протягом 2 годин." },
  "3": { button: "Протягом 3 годин", sentence: "Це протягом 3 годин." },
  "4": { button: "Протягом 4 годин", sentence: "Це протягом 4 годин." },
  "morning": { button: "Завтра вранці", sentence: "Це завтра вранці." },
};

const SLOT_PATTERN = /^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/;

/**
 * Convert an NL slot like "18:30-20:00" to the start and end moments.
 * "Tomorrow morning" and a slot that has already ended today are taken as tomorrow's.
 */
export function slotMoments(slot, now, tomorrow = false) {
  const match = SLOT_PATTERN.exec(slot);
  if (!match) {
    throw new Error(`Not a Silpo slot: ${slot}`);
  }
  const [startHour, startMinute, endHour, endMinute] = match.slice(1).map(Number);

  let nlDay = zonedParts(now, NL_TIMEZONE);
  let end = zonedTimeToDate(nlDay, endHour, endMinute, NL_TIMEZONE);
  if (tomorrow || end <= now) {
    nlDay = addDays(nlDay, 1);
    end = zonedTimeToDate(nlDay, endHour, endMinute, NL_TIMEZONE);
  }
  return { start: zonedTimeToDate(nlDay, startHour, startMinute, NL_TIMEZONE), end };
}

function kyivTime(moment) {
  const { hour, minute } = zonedParts(moment, KYIV_TIMEZONE);
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

/** The sentence the tablet reads out: the slot in Kyiv time and the "when" you chose. */
export function courierMessage(slot, when, now) {
  const option = WHEN_OPTIONS[when];
  if (!option) {
    throw new Error(`Unknown Silpo time option: ${when}`);
  }
  const { start, end } = slotMoments(slot, now, when === "morning");
  return `Кур'єр Сільпо буде між ${kyivTime(start)} та ${kyivTime(end)}. ${option.sentence}`;
}
