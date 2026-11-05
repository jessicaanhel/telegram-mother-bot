// Planned power outages: you type (or forward) 1-3 time windows, and Anabelle sends one reminder
// to the tablet about 3 hours before the first one, only between 9:30 and 22:00.
import { HOUR, KYIV_TIMEZONE, addDays, kyivDay, zonedParts, zonedTimeToDate } from "./time_zones.js";

const SEND_FROM = { hour: 9, minute: 30 };   // never earlier
const SEND_UNTIL = { hour: 22, minute: 0 };  // never later
const RECORD_TTL_SECONDS = 3 * 24 * 60 * 60;
const DAY = 24 * HOUR;

// "22:30-00:40", "16-20:00", "з 07:30 до 17:00" (also inside a forwarded DTEK message)
const WINDOW_PATTERN = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|—|до)\s*(\d{1,2})(?:[:.](\d{2}))?/g;

/**
 * Clock windows in minutes since midnight, in the order they were written.
 * An end earlier than the start (22:30-00:40) means the window runs past midnight.
 */
export function parseWindows(text) {
  const windows = [];
  for (const match of text.matchAll(WINDOW_PATTERN)) {
    const [startHour, startMinute, endHour, endMinute] = [match[1], match[2] ?? 0, match[3], match[4] ?? 0].map(Number);
    const valid = startHour <= 24 && endHour <= 24 && startMinute < 60 && endMinute < 60;
    const start = (startHour % 24) * 60 + startMinute;
    const end = (endHour % 24) * 60 + endMinute;
    if (valid && start !== end) {
      windows.push({ start, end });
    }
  }
  return windows;
}

function kyivMoment(day, minutes) {
  return zonedTimeToDate(day, Math.floor(minutes / 60), minutes % 60, KYIV_TIMEZONE);
}

/**
 * Real start/end moments. Nothing is in the past: a first window that is already over moves to the next day,
 * and a later window that starts before the previous one belongs to the next day (22:30-00:40, then 4:00-6:00).
 * Overlapping windows on the same day (7:30-17:00, 16:00-20:00) stay on that day.
 */
export function resolveWindows(clockWindows, firstDay, now) {
  const resolved = [];
  for (const clock of clockWindows) {
    const previous = resolved.at(-1);
    let day = previous ? kyivDay(previous.start) : firstDay;
    let start = kyivMoment(day, clock.start);
    if (previous && start <= previous.start) {
      day = addDays(day, 1);
      start = kyivMoment(day, clock.start);
    }
    let end = kyivMoment(clock.end > clock.start ? day : addDays(day, 1), clock.end);
    if (!previous && end <= now) {
      start = new Date(start.getTime() + DAY);
      end = new Date(end.getTime() + DAY);
    }
    resolved.push({ start, end });
  }
  return resolved;
}

/**
 * About 3 hours before the first outage (the cron runs every 15 minutes), but only between 9:30 and 22:00:
 * after 22:00 -> 22:00; before 9:30 -> 9:30 if that is still 2 hours before, else 22:00 the evening before.
 */
export function reminderTime(firstStart) {
  const target = new Date(firstStart.getTime() - 3 * HOUR);
  const day = kyivDay(target);
  const sendFrom = zonedTimeToDate(day, SEND_FROM.hour, SEND_FROM.minute, KYIV_TIMEZONE);
  const sendUntil = zonedTimeToDate(day, SEND_UNTIL.hour, SEND_UNTIL.minute, KYIV_TIMEZONE);
  if (target > sendUntil) {
    return sendUntil;
  }
  if (target >= sendFrom) {
    return target;
  }
  if (firstStart.getTime() - 2 * HOUR >= sendFrom.getTime()) {
    return sendFrom;
  }
  return zonedTimeToDate(addDays(day, -1), SEND_UNTIL.hour, SEND_UNTIL.minute, KYIV_TIMEZONE);
}

// ---- texts ----

export function clockTime(moment) {
  const { hour, minute } = zonedParts(moment, KYIV_TIMEZONE);
  return `${hour}:${String(minute).padStart(2, "0")}`;
}

function daysBetween(fromMoment, toMoment) {
  const from = kyivDay(fromMoment);
  const to = kyivDay(toMoment);
  return Math.round((Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / DAY);
}

function dayWord(moment, reference, words) {
  const days = daysBetween(reference, moment);
  if (days >= 0 && days < words.length) {
    return words[days];
  }
  const { day, month } = kyivDay(moment);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}`;
}

// "Сегодня с 22:30 до 0:40 и завтра с 4:00 до 6:00": the day is named for the first window and whenever it changes
function windowsSentence(windows, reference, words, from, to, and) {
  const parts = windows.map((window, index) => {
    const changesDay = index === 0 || daysBetween(windows[index - 1].start, window.start) !== 0;
    const prefix = changesDay ? `${dayWord(window.start, reference, words)} ` : "";
    return `${prefix}${from} ${clockTime(window.start)} ${to} ${clockTime(window.end)}`;
  });
  return parts.join(` ${and} `);
}

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/** The text the tablet reads (Russian), relative to when it is sent. The tablet adds the battery part. */
export function outageMessage(windows, sentAt) {
  const times = windowsSentence(windows, sentAt, ["сегодня", "завтра", "послезавтра"], "с", "до", "и");
  const sentence = `${capitalize(times)} не будет света.`;
  return `${sentence} ${sentence} Не забудь зарядить свои устройства.`;
}

/** For the chat with Anabelle (Ukrainian). */
export function describeWindows(windows, now) {
  return windowsSentence(windows, now, ["сьогодні", "завтра", "післязавтра"], "з", "до", "і");
}

export function kyivDateTime(moment) {
  const { day, month } = zonedParts(moment, KYIV_TIMEZONE);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")} о ${clockTime(moment)}`;
}

// ---- storage (Workers KV) ----

const RECORD_PREFIX = "outage:";
const pendingKey = (chatId) => `pending-outage:${chatId}`;

const toStored = (windows) => windows.map((w) => ({ start: w.start.toISOString(), end: w.end.toISOString() }));
const fromStored = (windows) => windows.map((w) => ({ start: new Date(w.start), end: new Date(w.end) }));

export async function saveOutage(env, chatId, windows) {
  const record = {
    id: windows[0].start.toISOString(),
    chatId,
    windows: toStored(windows),
    sendAt: reminderTime(windows[0].start).toISOString(),
    sent: false,
  };
  await env.OUTAGES.put(RECORD_PREFIX + record.id, JSON.stringify(record), { expirationTtl: RECORD_TTL_SECONDS });
  return { ...record, windows };
}

/** All saved outages, soonest first, with real Date windows. */
export async function listOutages(env) {
  const { keys } = await env.OUTAGES.list({ prefix: RECORD_PREFIX });
  const records = [];
  for (const { name } of keys) {
    const record = await env.OUTAGES.get(name, "json");
    if (record) {
      records.push({ ...record, windows: fromStored(record.windows) });
    }
  }
  return records.sort((a, b) => a.windows[0].start - b.windows[0].start);
}

export function deleteOutage(env, id) {
  return env.OUTAGES.delete(RECORD_PREFIX + id);
}

async function markSent(env, record) {
  const stored = { ...record, windows: toStored(record.windows), sent: true };
  await env.OUTAGES.put(RECORD_PREFIX + record.id, JSON.stringify(stored), { expirationTtl: RECORD_TTL_SECONDS });
}

// After tapping "today"/"tomorrow" the next text message is the time windows
export function setPendingDay(env, chatId, dateKey) {
  return env.OUTAGES.put(pendingKey(chatId), dateKey, { expirationTtl: 15 * 60 });
}

export function getPendingDay(env, chatId) {
  return env.OUTAGES.get(pendingKey(chatId));
}

export function clearPendingDay(env, chatId) {
  return env.OUTAGES.delete(pendingKey(chatId));
}

// ---- sending ----

/**
 * Send every reminder that is due (cron every 15 minutes, and right after saving, so a late entry goes out at once).
 * `sendToTablet(text)` returns Telegram's result; `notifyChat(chatId, text)` tells you it went out.
 */
export async function sendDueReminders(env, now, sendToTablet, notifyChat) {
  for (const record of await listOutages(env)) {
    const lastEnd = new Date(Math.max(...record.windows.map((w) => w.end.getTime())));
    if (record.sent || now < new Date(record.sendAt) || now >= lastEnd) {
      continue;
    }
    const text = outageMessage(record.windows, now);
    const result = await sendToTablet(text);
    if (!result.ok) {
      console.error("Outage reminder not sent, will retry", result.description);
      continue;
    }
    await markSent(env, record);
    await notifyChat(record.chatId, `📤 Нагадування надіслано на планшет:\n${text}`);
  }
}

