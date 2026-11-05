// Planned power outages: you enter (or forward) the time windows for today or tomorrow,
// and Anabelle sends a reminder to the tablet 2-3 hours before the first one.
import { HOUR, KYIV_TIMEZONE, addDays, dayKey, kyivDay, parseDayKey, zonedTimeToDate } from "./time_zones.js";

const MINUTES_PER_DAY = 24 * 60;
const EARLIEST_REMINDER = { hour: 9, minute: 30 };    // never wake anyone before 9:30
const EVENING_BEFORE = { hour: 20, minute: 0 };       // early outages are announced the evening before
const RECORD_TTL_SECONDS = 3 * 24 * 60 * 60;

// "7:30-17:00", "16-20:00", "з 07:30 до 17:00" (also inside a forwarded DTEK message)
const WINDOW_PATTERN = /(\d{1,2})(?:[:.](\d{2}))?\s*(?:-|–|—|до)\s*(\d{1,2})(?:[:.](\d{2}))?/g;

/** Time windows in minutes since midnight (Kyiv), sorted by start. */
export function parseWindows(text) {
  const windows = [];
  for (const match of text.matchAll(WINDOW_PATTERN)) {
    const start = Number(match[1]) * 60 + Number(match[2] ?? 0);
    let end = Number(match[3]) * 60 + Number(match[4] ?? 0);
    if (end === 0) {
      end = MINUTES_PER_DAY; // "до 00:00" means until midnight
    }
    const validMinutes = Number(match[2] ?? 0) < 60 && Number(match[4] ?? 0) < 60;
    if (validMinutes && start < end && end <= MINUTES_PER_DAY) {
      windows.push({ start, end });
    }
  }
  return windows.sort((a, b) => a.start - b.start);
}

export function formatTime(minutes) {
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

/** The text the tablet reads (Russian). The tablet adds the battery part itself. */
export function outageMessage(windows, isTomorrow) {
  const day = isTomorrow ? "Завтра" : "Сегодня";
  const times = windows.map((w) => `с ${formatTime(w.start)} до ${formatTime(w.end)}`).join(" и ");
  const sentence = `${day} ${times} не будет света.`;
  return `${sentence} ${sentence} Не забудь зарядить свои устройства.`;
}

function kyivMoment(day, minutes) {
  return zonedTimeToDate(day, Math.floor(minutes / 60), minutes % 60, KYIV_TIMEZONE);
}

/**
 * When to remind: 3 hours before the first outage (the cron runs every 15 minutes, so it goes out
 * 2:45-3:00 before), at 9:30 if that is still at least 2 hours before, otherwise at 20:00 the evening before.
 */
export function reminderTime(dateKey, windows) {
  const day = parseDayKey(dateKey);
  const start = kyivMoment(day, windows[0].start);
  const earliestAllowed = zonedTimeToDate(day, EARLIEST_REMINDER.hour, EARLIEST_REMINDER.minute, KYIV_TIMEZONE);
  if (start - 3 * HOUR >= earliestAllowed) {
    return new Date(start - 3 * HOUR);
  }
  if (start - 2 * HOUR >= earliestAllowed) {
    return earliestAllowed;
  }
  return zonedTimeToDate(addDays(day, -1), EVENING_BEFORE.hour, EVENING_BEFORE.minute, KYIV_TIMEZONE);
}

function lastEnd(record) {
  return kyivMoment(parseDayKey(record.date), Math.max(...record.windows.map((w) => w.end)));
}

// ---- storage (Workers KV) ----

const recordKey = (dateKey) => `outage:${dateKey}`;
const pendingKey = (chatId) => `pending-outage:${chatId}`;

export async function saveOutage(env, chatId, dateKey, windows) {
  const record = { date: dateKey, windows, chatId, sendAt: reminderTime(dateKey, windows).toISOString(), sent: false };
  await env.OUTAGES.put(recordKey(dateKey), JSON.stringify(record), { expirationTtl: RECORD_TTL_SECONDS });
  return record;
}

export function getOutage(env, dateKey) {
  return env.OUTAGES.get(recordKey(dateKey), "json");
}

export function deleteOutage(env, dateKey) {
  return env.OUTAGES.delete(recordKey(dateKey));
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
  const today = kyivDay(now);
  for (const day of [today, addDays(today, 1)]) {
    const record = await getOutage(env, dayKey(day));
    if (!record || record.sent || now < new Date(record.sendAt) || now >= lastEnd(record)) {
      continue;
    }
    const text = outageMessage(record.windows, dayKey(day) !== dayKey(today));
    const result = await sendToTablet(text);
    if (!result.ok) {
      console.error("Outage reminder not sent, will retry", result.description);
      continue;
    }
    record.sent = true;
    await env.OUTAGES.put(recordKey(record.date), JSON.stringify(record), { expirationTtl: RECORD_TTL_SECONDS });
    await notifyChat(record.chatId, `📤 Нагадування надіслано на планшет:\n${text}`);
  }
}
