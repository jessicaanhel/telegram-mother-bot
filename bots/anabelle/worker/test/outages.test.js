import test, { mock } from "node:test";
import assert from "node:assert/strict";
import { outageMessage, parseWindows, reminderTime, sendDueReminders } from "../src/outages.js";
import worker, { handleUpdate } from "../src/index.js";

// Kyiv is UTC+2 in November: "2026-11-05T16:00:00+02:00" is 16:00 in Kyiv
const kyiv = (local) => new Date(`${local}+02:00`);
const kyivTime = (moment) => moment.toLocaleString("en-GB", { timeZone: "Europe/Kyiv", dateStyle: "short", timeStyle: "short" });

test("parses typed and forwarded time windows", () => {
  assert.deepEqual(parseWindows("7:30-17:00, 16-20:00"), [{ start: 450, end: 1020 }, { start: 960, end: 1200 }]);
  assert.deepEqual(parseWindows("з 07:30 до 17:00 та з 16:00 до 20:00"), [{ start: 450, end: 1020 }, { start: 960, end: 1200 }]);
  assert.deepEqual(parseWindows("20:00-00:00"), [{ start: 1200, end: 1440 }]);
  // Dates in a DTEK message are not time windows
  assert.deepEqual(parseWindows("Орієнтовний час відновлення: 06.11.2026 00:00."), []);
  assert.deepEqual(parseWindows("завтра буде світло"), []);
});

test("Russian text for the tablet, said twice", () => {
  const windows = parseWindows("7:30-17:00, 16-20:00");
  assert.equal(
    outageMessage(windows, false),
    "Сегодня с 7:30 до 17:00 и с 16:00 до 20:00 не будет света. " +
      "Сегодня с 7:30 до 17:00 и с 16:00 до 20:00 не будет света. Не забудь зарядить свои устройства.",
  );
  assert.match(outageMessage(windows, true), /^Завтра с 7:30/);
});

test("reminder time: 3 hours before, 9:30 at the earliest, else the evening before", () => {
  const at = (from) => kyivTime(reminderTime("2026-11-06", parseWindows(from)));
  assert.equal(at("16:00-20:00"), "06/11/2026, 13:00"); // 3 h before
  assert.equal(at("12:00-14:00"), "06/11/2026, 09:30"); // 3 h before is 9:00, so 9:30 (still 2.5 h before)
  assert.equal(at("11:00-14:00"), "05/11/2026, 20:00"); // even 2 h before is too early -> evening before
  assert.equal(at("7:30-17:00, 16-20:00"), "05/11/2026, 20:00");
});

// ---- with a fake KV store and a fake Telegram ----

function fakeKV() {
  const data = new Map();
  return {
    data,
    get: async (key, type) => (data.has(key) ? (type === "json" ? JSON.parse(data.get(key)) : data.get(key)) : null),
    put: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
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

test("tomorrow's early outage: reminder at 20:00 the evening before, only once", async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ["Date"], now: kyiv("2026-11-05T15:00:00") });
  const env = makeEnv();
  const calls = fakeTelegram();

  await type(env, "/outage");
  assert.match(calls.at(-1).body.text, /Поки нічого не заплановано/);
  await tap(env, "outage_day:2026-11-06");
  assert.match(calls.at(-1).body.text, /завтра, 06\.11/);
  await type(env, "7:30-17:00, 16-20:00");
  assert.equal(calls.at(-1).body.text, "✅ Збережено на завтра, 06.11: з 7:30 до 17:00 і з 16:00 до 20:00.\nНагадування на планшет: 05.11 о 20:00.");
  assert.equal(sentToTablet(calls).length, 0);

  mock.timers.setTime(kyiv("2026-11-05T19:45:00").getTime());
  await cron(env);
  assert.equal(sentToTablet(calls).length, 0);

  mock.timers.setTime(kyiv("2026-11-05T20:00:00").getTime());
  await cron(env);
  assert.equal(sentToTablet(calls).length, 1);
  assert.match(sentToTablet(calls)[0].body.text, /^Завтра с 7:30 до 17:00 и с 16:00 до 20:00 не будет света\./);
  assert.match(calls.at(-1).body.text, /^📤 Нагадування надіслано на планшет:/);

  mock.timers.setTime(kyiv("2026-11-05T20:15:00").getTime());
  await cron(env);
  assert.equal(sentToTablet(calls).length, 1); // not twice
});

test("entered late (less than 2-3 hours left): sent right away, even before 9:30", async (t) => {
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

test("a normal afternoon outage goes out 3 hours before; menu shows it and can delete it", async (t) => {
  t.after(() => mock.timers.reset());
  mock.timers.enable({ apis: ["Date"], now: kyiv("2026-11-06T10:00:00") });
  const env = makeEnv();
  const calls = fakeTelegram();

  await tap(env, "outage_day:2026-11-06");
  await type(env, "16-20:00");
  assert.equal(sentToTablet(calls).length, 0);

  await tap(env, "outage_menu");
  assert.match(calls.at(-1).body.text, /сьогодні, 06\.11: з 16:00 до 20:00 \(нагадування 06\.11 о 13:00\)/);

  mock.timers.setTime(kyiv("2026-11-06T13:00:00").getTime());
  await cron(env);
  assert.equal(sentToTablet(calls).length, 1);

  await tap(env, "outage_delete:2026-11-06");
  assert.match(calls.at(-1).body.text, /Поки нічого не заплановано/);
});

test("text without numbers after choosing a day asks again; other text is ignored", async () => {
  const env = makeEnv();
  const calls = fakeTelegram();
  await type(env, "привіт");
  assert.equal(calls.length, 0);
  await tap(env, "outage_day:2026-11-06");
  await type(env, "завтра не буде світла");
  assert.match(calls.at(-1).body.text, /Не знайшла часу/);
});
