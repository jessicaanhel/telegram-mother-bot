import test from "node:test";
import assert from "node:assert/strict";
import { SLOTS, WHEN_OPTIONS, courierMessage } from "../src/silpo.js";
import worker, { handleUpdate } from "../src/index.js";

// "Now" given as UTC; the comments show the Kyiv clock
test("slot in Kyiv time plus the chosen 'when', no minutes", () => {
  const afternoon = new Date("2026-11-05T13:00:00Z"); // Kyiv 15:00
  assert.equal(courierMessage("9:30-11:00", "2", afternoon).startsWith("Кур'єр Сільпо буде між 10:30 та 12:00."), true);
  assert.equal(courierMessage("18:30-20:00", "2", afternoon), "Кур'єр Сільпо буде між 19:30 та 21:00. Це протягом 2 годин.");
  assert.equal(courierMessage("18:30-20:00", "1", afternoon), "Кур'єр Сільпо буде між 19:30 та 21:00. Це протягом години.");
  assert.equal(courierMessage("17:00-18:30", "4", afternoon), "Кур'єр Сільпо буде між 18:00 та 19:30. Це протягом 4 годин.");
  assert.equal(courierMessage("8:00-9:30", "morning", afternoon), "Кур'єр Сільпо буде між 9:00 та 10:30. Це завтра вранці.");
});

test("every slot and option works, also on summer/winter time switch days", () => {
  for (const now of ["2026-03-29T06:00:00Z", "2026-10-25T06:00:00Z", "2026-11-05T21:10:00Z"]) {
    for (const slot of SLOTS) {
      for (const when of Object.keys(WHEN_OPTIONS)) {
        assert.match(courierMessage(slot, when, new Date(now)), /^Кур'єр Сільпо буде між \d{1,2}:\d{2} та \d{1,2}:\d{2}\. Це /);
      }
    }
  }
  // 29 March: NL and Kyiv both switched to summer time, still exactly 1 hour apart
  assert.match(courierMessage("18:30-20:00", "3", new Date("2026-03-29T06:00:00Z")), /між 19:30 та 21:00/);
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

test("tapping a slot asks when, then sends the sentence to the notifier bot", async () => {
  const calls = fakeTelegram();
  const message = { chat: { id: 7 }, message_id: 5 };
  await handleUpdate({ callback_query: { id: "q2", data: "silpo_slot:18:30-20:00", message } }, env);
  assert.equal(calls.at(-1).method, "editMessageText");
  assert.equal(calls.at(-1).body.text, "Слот 18:30-20:00 (час NL). Коли це?");
  const options = calls.at(-1).body.reply_markup.inline_keyboard.map((row) => row[0]);
  assert.deepEqual(options.map((b) => b.text), ["Протягом години", "Протягом 2 годин", "Протягом 3 годин", "Протягом 4 годин", "Завтра вранці"]);
  assert.ok(options.every((b) => Buffer.byteLength(b.callback_data) <= 64)); // Telegram's limit

  const before = calls.length;
  await handleUpdate({ callback_query: { id: "q3", data: options[1].callback_data, message } }, env);
  const methods = calls.slice(before).map((call) => call.method);
  assert.deepEqual(methods, ["answerCallbackQuery", "sendMessage", "editMessageText"]);
  assert.equal(calls[before + 1].body.chat_id, "@roma_notiferbot");
  assert.equal(calls[before + 1].body.text, "Кур'єр Сільпо буде між 19:30 та 21:00. Це протягом 2 годин.");
  assert.equal(calls.at(-1).body.text, "✅ Передано на планшет:\nКур'єр Сільпо буде між 19:30 та 21:00. Це протягом 2 годин.");
});

test("a failed bot-to-bot send is reported in the chat", async () => {
  const calls = fakeTelegram({ sendMessage: { ok: false, description: "Forbidden: bot can't send messages to bots" } });
  await handleUpdate({ callback_query: { id: "q4", data: "silpo_when:8:00-9:30|morning", message: { chat: { id: 7 }, message_id: 6 } } }, env);
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
