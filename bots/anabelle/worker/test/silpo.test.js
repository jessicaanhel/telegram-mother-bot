import test from "node:test";
import assert from "node:assert/strict";
import { SLOTS, courierMessage, durationText } from "../src/silpo.js";
import worker, { handleUpdate } from "../src/index.js";

// "Now" given as UTC; the comments show the Kyiv clock. Expected texts are the Python version's output.
const cases = [
  ["18:30-20:00", "2026-11-05T15:05:00Z", "Кур'єр Сільпо буде між 19:30 та 21:00. Це протягом наступних 3 годин 55 хвилин."], // Kyiv 17:05
  ["20:00-21:30", "2026-11-05T19:40:00Z", "Кур'єр Сільпо буде між 21:00 та 22:30. Це протягом наступних 50 хвилин."], // Kyiv 21:40, slot running
  ["8:00-9:30", "2026-11-05T21:10:00Z", "Кур'єр Сільпо буде завтра між 9:00 та 10:30. Це протягом наступних 11 годин 20 хвилин."], // Kyiv 23:10, over -> tomorrow
  ["12:30-14:00", "2026-07-05T10:50:00Z", "Кур'єр Сільпо буде між 13:30 та 15:00. Це протягом наступних 1 години 10 хвилин."], // summer, Kyiv 13:50
  ["17:00-18:30", "2026-11-05T15:00:00Z", "Кур'єр Сільпо буде між 18:00 та 19:30. Це протягом наступних 2 годин 30 хвилин."], // Kyiv 17:00
];

for (const [slot, now, expected] of cases) {
  test(`${slot} at ${now} matches the Python bot`, () => {
    assert.equal(courierMessage(slot, new Date(now)), expected);
  });
}

test("every slot button works on a summer/winter time switch day", () => {
  for (const now of ["2026-03-29T06:00:00Z", "2026-10-25T06:00:00Z"]) {
    for (const slot of SLOTS) {
      assert.match(courierMessage(slot, new Date(now)), /^Кур'єр Сільпо буде /);
    }
  }
  // 29 March: NL and Kyiv both switched to summer time, still exactly 1 hour apart
  assert.match(courierMessage("18:30-20:00", new Date("2026-03-29T06:00:00Z")), /між 19:30 та 21:00/);
});

test("genitive forms", () => {
  assert.equal(durationText(21 * 60), "21 години");
  assert.equal(durationText(11 * 60 + 1), "11 годин 1 хвилини");
  assert.equal(durationText(0), "0 хвилин");
});

// ---- Telegram flow with a fake Bot API ----

function fakeTelegram(results = {}) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    const method = url.split("/").pop();
    calls.push({ method, body: JSON.parse(init.body) });
    return new Response(JSON.stringify(results[method] ?? { ok: true, result: {} }));
  };
  return calls;
}

const env = { TELEGRAM_BOT_TOKEN: "1:x", WEBHOOK_SECRET: "s3cret", NOTIFIER_BOT_USERNAME: "@roma_notiferbot" };

test("/start shows the menu, the button shows 9 slots", async () => {
  const calls = fakeTelegram();
  await handleUpdate({ message: { text: "/start", chat: { id: 7 }, from: { first_name: "Anhelika" } } }, env);
  assert.equal(calls[0].body.text, "Привіт, Anhelika!");
  assert.deepEqual(calls[0].body.reply_markup, { remove_keyboard: true }); // old reply keyboard goes away
  assert.equal(calls[1].body.text, "Що зробимо?");
  const menu = calls[1].body.reply_markup.inline_keyboard.map((row) => row[0].callback_data);
  assert.deepEqual(menu, ["silpo_menu", "outage_menu"]);

  await handleUpdate({ callback_query: { id: "q1", data: "silpo_menu", message: { chat: { id: 7 }, message_id: 1 } } }, env);
  const slots = calls.at(-1).body.reply_markup.inline_keyboard.flat().map((button) => button.text);
  assert.deepEqual(slots, SLOTS);
});

test("tapping a slot sends the sentence to the notifier bot and confirms", async () => {
  const calls = fakeTelegram();
  await handleUpdate({ callback_query: { id: "q2", data: "silpo_slot:18:30-20:00", message: { chat: { id: 7 }, message_id: 5 } } }, env);
  const methods = calls.map((call) => call.method);
  assert.deepEqual(methods, ["answerCallbackQuery", "sendMessage", "editMessageText"]);
  assert.equal(calls[1].body.chat_id, "@roma_notiferbot");
  assert.match(calls[1].body.text, /^Кур'єр Сільпо буде /);
  assert.match(calls[2].body.text, /^✅ Передано на планшет:\nКур'єр Сільпо буде /);
});

test("a failed bot-to-bot send is reported in the chat", async () => {
  const calls = fakeTelegram({ sendMessage: { ok: false, description: "Forbidden: bot can't send messages to bots" } });
  await handleUpdate({ callback_query: { id: "q3", data: "silpo_slot:8:00-9:30", message: { chat: { id: 7 }, message_id: 6 } } }, env);
  assert.equal(calls.at(-1).body.text, "⚠️ Не вдалося передати на планшет: Forbidden: bot can't send messages to bots");
});

test("requests without Telegram's secret header are refused", async () => {
  fakeTelegram();
  const response = await worker.fetch(new Request("https://anabelle.example/telegram", { method: "POST", body: "{}" }), env);
  assert.equal(response.status, 403);
  const setup = await worker.fetch(new Request("https://anabelle.example/setup", { method: "POST" }), env);
  assert.equal(setup.status, 403);
});

test("/setup points the webhook at /telegram with the secret", async () => {
  const calls = fakeTelegram();
  const response = await worker.fetch(
    new Request("https://anabelle.example/setup", { method: "POST", headers: { "X-Setup-Secret": "s3cret" } }), env,
  );
  assert.equal(response.status, 200);
  assert.equal(calls[0].body.url, "https://anabelle.example/telegram");
  assert.equal(calls[0].body.secret_token, "s3cret");
  assert.equal(calls[1].method, "setMyCommands");
});
