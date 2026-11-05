import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { describeWindows, outageMessage, parseWindows, reminderTime, resolveWindows } from "../src/outages.js";
import worker, { handleUpdate } from "../src/index.js";

// Kyiv is UTC+2 in November: "2026-11-05T16:00:00+02:00" is 16:00 in Kyiv
const kyiv = (local) => new Date(`${local}+02:00`);
const kyivTime = (moment) => moment.toLocaleString("en-GB", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" });
const NOV_5 = { year: 2026, month: 11, day: 5 };
const NOV_6 = { year: 2026, month: 11, day: 6 };
const resolve = (text, firstDay, now) => resolveWindows(parseWindows(text), firstDay, now)
  .map((w) => `${kyivTime(w.start)} - ${kyivTime(w.end)}`);

test("parses 1-3 windows in the written order, including ones past midnight", () => {
  assert.deepEqual(parseWindows("22:30-00:40, 4:00-6:00"), [{ start: 1350, end: 40 }, { start: 240, end: 360 }]);
  assert.deepEqual(parseWindows("з 07:30 до 17:00 та з 16:00 до 20:00"), [{ start: 450, end: 1020 }, { start: 960, end: 1200 }]);
  assert.equal(parseWindows("8-10, 14-16, 20-22").length, 3);
  // Dates in a DTEK message are not time windows
  assert.deepEqual(parseWindows("Орієнтовний час відновлення: 06.11.2026 00:00."), []);
  assert.deepEqual(parseWindows("завтра буде світло"), []);
});

test("windows get real days: past midnight and later windows move to the next day", () => {
  const evening = kyiv("2026-11-05T19:00:00");
  assert.deepEqual(resolve("22:30-00:40, 4:00-6:00", NOV_5, evening), [
    "05/11/2026, 22:30 - 06/11/2026, 00:40",
    "06/11/2026, 04:00 - 06/11/2026, 06:00",
  ]);
  // overlapping windows on one day stay on that day
  assert.deepEqual(resolve("7:30-17:00, 16-20:00", NOV_6, evening), [
    "06/11/2026, 07:30 - 06/11/2026, 17:00",
    "06/11/2026, 16:00 - 06/11/2026, 20:00",
  ]);
  // "never about the past": a window already over today means tomorrow
  assert.deepEqual(resolve("7:30-9:00", NOV_5, evening), ["06/11/2026, 07:30 - 06/11/2026, 09:00"]);
  // a window that is running now stays today
  assert.deepEqual(resolve("18:00-21:00", NOV_5, evening), ["05/11/2026, 18:00 - 05/11/2026, 21:00"]);
});

test("reminder: 3 h before, only between 9:30 and 22:00", () => {
  const at = (start) => kyivTime(reminderTime(kyiv(start)));
  assert.equal(at("2026-11-06T16:00:00"), "06/11/2026, 13:00"); // 3 h before
  assert.equal(at("2026-11-06T12:00:00"), "06/11/2026, 09:30"); // 9:00 too early, 9:30 still 2.5 h before
  assert.equal(at("2026-11-06T11:00:00"), "05/11/2026, 22:00"); // too early even 2 h before -> 22:00 the evening before
  assert.equal(at("2026-11-06T07:30:00"), "05/11/2026, 22:00");
  assert.equal(at("2026-11-05T22:30:00"), "05/11/2026, 19:30");
  assert.equal(at("2026-11-06T00:30:00"), "05/11/2026, 21:30");
  assert.equal(at("2026-11-06T01:30:00"), "05/11/2026, 22:00"); // 22:30 would be too late
});

test("Russian text names the day of each window, said twice", () => {
  const windows = resolveWindows(parseWindows("22:30-00:40, 4:00-6:00"), NOV_5, kyiv("2026-11-05T19:00:00"));
  assert.equal(
    outageMessage(windows, kyiv("2026-11-05T19:30:00")),
    "Сегодня с 22:30 до 0:40 и завтра с 4:00 до 6:00 не будет света. " +
      "Сегодня с 22:30 до 0:40 и завтра с 4:00 до 6:00 не будет света. Не забудь зарядить свои устройства.",
  );
  const sameDay = resolveWindows(parseWindows("7:30-17:00, 16-20:00"), NOV_6, kyiv("2026-11-05T19:00:00"));
  assert.match(outageMessage(sameDay, kyiv("2026-11-05T22:00:00")), /^Завтра с 7:30 до 17:00 и с 16:00 до 20:00 не будет света\./);
  assert.equal(describeWindows(windows, kyiv("2026-11-05T19:00:00")), "сьогодні з 22:30 до 0:40 і завтра з 4:00 до 6:00");
});

// ---- with a fake KV store and a fake Telegram ----

function fakeKV() {
  const data = new Map();
  return {
    data,
    get: async (key, type) => (data.has(key) ? (type === "json" ? JSON.parse(data.get(key)) : data.get(key)) : null),
    put: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
    list: async ({ prefix }) => ({ keys: [...data.keys()].filter((key) => key.startsWith(prefix)).map((name) => ({ name })) }),
  };
}

function fakeTelegram() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ method: url.split("/").pop(), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ ok: true, result: {} }));
  };
  return calls;
}

const sentToTablet = (calls) => calls.filter((c) => c.method === "sendMessage" && c.body.chat_id === "@roma_notiferbot");

function makeEnv() {
  return { TELEGRAM_BOT_TOKEN: "1:x", WEBHOOK_SECRET: "s", NOTIFIER_BOT_USERNAME: "@roma_notiferbot", OUTAGES: fakeKV() };
}

async function type(env, text) {
  await handleUpdate({ message: { text, chat: { id: 7 }, from: { first_name: "Anhelika" } } }, env);
}

async function tap(env, data) {
  await handleUpdate({ callback_query: { id: "q", data, message: { chat: { id: 7 }, message_id: 1 } } }, env);
}

async function cron(env) {
  const waits = [];
  await worker.scheduled({}, env, { waitUntil: (p) => waits.push(p) });
  await Promise.all(waits);
}

test("night outage entered in the afternoon: reminder 3 h before, only once", async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ["Date"], now: kyiv("2026-11-05T15:00:00") });
  const env = makeEnv();
  const calls = fakeTelegram();

  await type(env, "/outage");
  assert.match(calls.at(-1).body.text, /Поки нічого не заплановано/);
  await tap(env, "outage_day:2026-11-05");
  await type(env, "22:30-00:40, 4:00-6:00");
  assert.equal(
    calls.at(-1).body.text,
    "✅ Збережено: сьогодні з 22:30 до 0:40 і завтра з 4:00 до 6:00.\nНагадування на планшет: 05.11 о 19:30.",
  );
  assert.equal(sentToTablet(calls).length, 0);

  mock.timers.setTime(kyiv("2026-11-05T19:15:00").getTime());
  await cron(env);
  assert.equal(sentToTablet(calls).length, 0);

  mock.timers.setTime(kyiv("2026-11-05T19:30:00").getTime());
  await cron(env);
  assert.equal(sentToTablet(calls).length, 1);
  assert.match(sentToTablet(calls)[0].body.text, /^Сегодня с 22:30 до 0:40 и завтра с 4:00 до 6:00 не будет света\./);
  assert.match(calls.at(-1).body.text, /^📤 Нагадування надіслано на планшет:/);

  mock.timers.setTime(kyiv("2026-11-05T19:45:00").getTime());
  await cron(env);
  assert.equal(sentToTablet(calls).length, 1); // not twice
});

test("early morning outage: reminder at 22:00 the evening before", async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ["Date"], now: kyiv("2026-11-05T12:00:00") });
  const env = makeEnv();
  const calls = fakeTelegram();

  await tap(env, "outage_day:2026-11-06");
  await type(env, "7:30-17:00, 16-20:00");
  assert.match(calls.at(-1).body.text, /Нагадування на планшет: 05\.11 о 22:00\./);

  mock.timers.setTime(kyiv("2026-11-05T22:00:00").getTime());
  await cron(env);
  assert.match(sentToTablet(calls)[0].body.text, /^Завтра с 7:30 до 17:00 и с 16:00 до 20:00 не будет света\./);
});

test("entered late (less than 2-3 hours left): sent right away", async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ["Date"], now: kyiv("2026-11-06T08:10:00") });
  const env = makeEnv();
  const calls = fakeTelegram();

  await tap(env, "outage_day:2026-11-06");
  await type(env, "з 09:00 до 12:00");
  assert.match(calls.find((c) => c.body.text?.startsWith("✅")).body.text, /надсилаю зараз/);
  assert.equal(sentToTablet(calls).length, 1);
  assert.match(sentToTablet(calls)[0].body.text, /^Сегодня с 9:00 до 12:00 не будет света\./);
});

test("menu lists planned outages and deletes them", async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ["Date"], now: kyiv("2026-11-06T10:00:00") });
  const env = makeEnv();
  const calls = fakeTelegram();

  await tap(env, "outage_day:2026-11-06");
  await type(env, "16-20:00");
  await tap(env, "outage_menu");
  const menu = calls.at(-1).body;
  assert.match(menu.text, /• сьогодні з 16:00 до 20:00 \(нагадування 06\.11 о 13:00\)/);

  const deleteButton = menu.reply_markup.inline_keyboard.flat().find((b) => b.callback_data.startsWith("outage_delete:"));
  await tap(env, deleteButton.callback_data);
  assert.match(calls.at(-1).body.text, /Поки нічого не заплановано/);
});

test("text without times after choosing a day asks again; other text is ignored", async () => {
  const env = makeEnv();
  const calls = fakeTelegram();
  await type(env, "привіт");
  assert.equal(calls.length, 0);
  await tap(env, "outage_day:2026-11-06");
  await type(env, "завтра не буде світла");
  assert.match(calls.at(-1).body.text, /Не знайшла часу/);
});
