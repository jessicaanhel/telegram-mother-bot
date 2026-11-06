// Anabelle on a free Cloudflare Worker: Telegram posts every update to /telegram.
// For now /start, Silpo and planned power outages; the Python bot (bots/anabelle) keeps the other features locally.
import { SLOTS, WHEN_OPTIONS, courierMessage } from "./silpo.js";
import {
  clearPendingDay, deleteOutage, describeWindows, getPendingDay, kyivDateTime, listOutages, parseWindows,
  resolveWindows, saveOutage, sendDueReminders, setPendingDay,
} from "./outages.js";
import { addDays, dayKey, kyivDay, parseDayKey } from "./time_zones.js";

const SLOTS_PER_ROW = 3;
const SILPO_MENU_CALLBACK = "silpo_menu";
const SLOT_CALLBACK_PREFIX = "silpo_slot:";
const WHEN_CALLBACK_PREFIX = "silpo_when:"; // silpo_when:<slot>|<option>
const OUTAGE_MENU_CALLBACK = "outage_menu";
const OUTAGE_DAY_PREFIX = "outage_day:";
const OUTAGE_DELETE_PREFIX = "outage_delete:";

const COMMANDS = [
  { command: "start", description: "Головне меню" },
  { command: "silpo", description: "Час приїзду кур'єра Сільпо" },
  { command: "outage", description: "Планове відключення світла" },
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/setup") {
      return setup(request, env, url);
    }
    if (request.method !== "POST" || url.pathname !== "/telegram") {
      return new Response("Not found", { status: 404 });
    }
    if (request.headers.get("X-Telegram-Bot-Api-Secret-Token") !== env.WEBHOOK_SECRET) {
      return new Response("Forbidden", { status: 403 });
    }

    try {
      await handleUpdate(await request.json(), env);
    } catch (error) {
      console.error("Update failed", error);
    }
    // Always 200: otherwise Telegram sends the same update again
    return new Response("ok");
  },

  // Cron Trigger (every 15 minutes, see wrangler.jsonc): send outage reminders that are due
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendReminders(env));
  },
};

function sendReminders(env) {
  return sendDueReminders(
    env,
    new Date(),
    // Bot-to-bot message to the notifier bot, whose webhook goes to MacroDroid on the tablet
    (text) => telegram(env, "sendMessage", { chat_id: env.NOTIFIER_BOT_USERNAME, text }),
    (chatId, text) => telegram(env, "sendMessage", { chat_id: chatId, text }),
  );
}

// One-time: point the bot at this Worker and fill its "/" menu.
// curl -X POST https://<worker>/setup -H "X-Setup-Secret: <WEBHOOK_SECRET>"
async function setup(request, env, url) {
  if (request.headers.get("X-Setup-Secret") !== env.WEBHOOK_SECRET) {
    return new Response("Forbidden", { status: 403 });
  }
  const webhook = await telegram(env, "setWebhook", {
    url: `${url.origin}/telegram`,
    secret_token: env.WEBHOOK_SECRET,
    allowed_updates: ["message", "callback_query"],
  });
  const commands = await telegram(env, "setMyCommands", { commands: COMMANDS });
  return Response.json({ webhook, commands });
}

export async function handleUpdate(update, env) {
  if (update.message?.text) {
    const { chat, from, text } = update.message;
    if (text.startsWith("/start")) {
      // Removes the old reply keyboard under the input field (Почитать, Узнать, Вернуться назад, emoji)
      // that an earlier version of this bot left behind; Telegram keeps it until a bot removes it.
      await telegram(env, "sendMessage", {
        chat_id: chat.id,
        text: `Привіт, ${from.first_name}!`,
        reply_markup: { remove_keyboard: true },
      });
      await telegram(env, "sendMessage", {
        chat_id: chat.id,
        text: "Що зробимо?",
        reply_markup: {
          inline_keyboard: [
            [{ text: "🛒 Кур'єр Сільпо", callback_data: SILPO_MENU_CALLBACK }],
            [{ text: "💡 Відключення світла", callback_data: OUTAGE_MENU_CALLBACK }],
          ],
        },
      });
    } else if (text.startsWith("/silpo")) {
      await askForSlot(env, chat.id);
    } else if (text.startsWith("/outage")) {
      await showOutageMenu(env, chat.id);
    } else if (!text.startsWith("/")) {
      // Typed or forwarded outage times, right after choosing today/tomorrow
      const pendingDay = await getPendingDay(env, chat.id);
      if (pendingDay) {
        await saveOutageTimes(env, chat.id, pendingDay, text);
      }
    }
    return;
  }

  const query = update.callback_query;
  if (!query) {
    return;
  }
  await telegram(env, "answerCallbackQuery", { callback_query_id: query.id });
  if (query.data === SILPO_MENU_CALLBACK) {
    await askForSlot(env, query.message.chat.id);
  } else if (query.data?.startsWith(SLOT_CALLBACK_PREFIX)) {
    await askWhen(env, query);
  } else if (query.data?.startsWith(WHEN_CALLBACK_PREFIX)) {
    await sendSlotToTablet(env, query);
  } else if (query.data === OUTAGE_MENU_CALLBACK) {
    await showOutageMenu(env, query.message.chat.id);
  } else if (query.data?.startsWith(OUTAGE_DAY_PREFIX)) {
    await askForOutageTimes(env, query.message.chat.id, query.data.slice(OUTAGE_DAY_PREFIX.length));
  } else if (query.data?.startsWith(OUTAGE_DELETE_PREFIX)) {
    await deleteOutage(env, query.data.slice(OUTAGE_DELETE_PREFIX.length));
    await showOutageMenu(env, query.message.chat.id);
  }
}

// ---- planned power outages ----

async function showOutageMenu(env, chatId) {
  const now = new Date();
  const lines = ["💡 Планові відключення (київський час)"];
  const deleteButtons = [];
  for (const record of await listOutages(env)) {
    const status = record.sent ? "нагадування надіслано" : `нагадування ${kyivDateTime(new Date(record.sendAt))}`;
    const windows = describeWindows(record.windows, now);
    lines.push(`• ${windows} (${status})`);
    deleteButtons.push([{ text: `🗑 ${windows}`, callback_data: OUTAGE_DELETE_PREFIX + record.id }]);
  }
  if (lines.length === 1) {
    lines.push("Поки нічого не заплановано.");
  }
  lines.push("", "З якого дня ввести час?");
  const today = kyivDay(now);
  const keyboard = [
    [
      { text: "Сьогодні", callback_data: OUTAGE_DAY_PREFIX + dayKey(today) },
      { text: "Завтра", callback_data: OUTAGE_DAY_PREFIX + dayKey(addDays(today, 1)) },
    ],
    ...deleteButtons,
  ];
  await telegram(env, "sendMessage", { chat_id: chatId, text: lines.join("\n"), reply_markup: { inline_keyboard: keyboard } });
}

async function askForOutageTimes(env, chatId, dateKey) {
  await setPendingDay(env, chatId, dateKey);
  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text:
      "Напиши 1-3 проміжки без світла за київським часом, по порядку, наприклад:\n" +
      "22:30-00:40, 4:00-6:00\n" +
      "Час, що вже минув, і проміжки після півночі я віднесу на наступний день. Або перешли повідомлення від ДТЕК.",
  });
}

async function saveOutageTimes(env, chatId, dateKey, text) {
  const clockWindows = parseWindows(text);
  if (!clockWindows.length) {
    await telegram(env, "sendMessage", {
      chat_id: chatId,
      text: "Не знайшла часу 🤔 Напиши так: 22:30-00:40, 4:00-6:00",
    });
    return;
  }
  await clearPendingDay(env, chatId);
  const now = new Date();
  const windows = resolveWindows(clockWindows, parseDayKey(dateKey), now);
  const record = await saveOutage(env, chatId, windows);
  const sendAt = new Date(record.sendAt);
  const when = sendAt <= now ? "надсилаю зараз" : kyivDateTime(sendAt);
  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: `✅ Збережено: ${describeWindows(windows, now)}.\nНагадування на планшет: ${when}.`,
  });
  // Entered late (reminder time already passed)? Then it goes out right now.
  await sendReminders(env);
}

async function askForSlot(env, chatId) {
  const buttons = SLOTS.map((slot) => ({ text: slot, callback_data: SLOT_CALLBACK_PREFIX + slot }));
  const rows = [];
  for (let i = 0; i < buttons.length; i += SLOTS_PER_ROW) {
    rows.push(buttons.slice(i, i + SLOTS_PER_ROW));
  }
  await telegram(env, "sendMessage", {
    chat_id: chatId,
    text: "Обери час доставки Сільпо (як у застосунку, час NL):",
    reply_markup: { inline_keyboard: rows },
  });
}

// After the slot: when is it? Replaces the slot buttons in the same message.
async function askWhen(env, query) {
  const slot = query.data.slice(SLOT_CALLBACK_PREFIX.length);
  const buttons = Object.entries(WHEN_OPTIONS).map(([option, { button }]) => [
    { text: button, callback_data: `${WHEN_CALLBACK_PREFIX}${slot}|${option}` },
  ]);
  await telegram(env, "editMessageText", {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: `Слот ${slot} (час NL). Коли це?`,
    reply_markup: { inline_keyboard: buttons },
  });
}

async function sendSlotToTablet(env, query) {
  const [slot, when] = query.data.slice(WHEN_CALLBACK_PREFIX.length).split("|");
  const message = courierMessage(slot, when, new Date());

  // Bot-to-bot message: needs "Bot-to-Bot Communication Mode" on for this bot and the notifier bot.
  // The notifier bot's webhook delivers it to MacroDroid on the tablet, which reads it out.
  const sent = await telegram(env, "sendMessage", { chat_id: env.NOTIFIER_BOT_USERNAME, text: message });

  const reply = sent.ok
    ? `✅ Передано на планшет:\n${message}`
    : `⚠️ Не вдалося передати на планшет: ${sent.description}`;
  await telegram(env, "editMessageText", {
    chat_id: query.message.chat.id,
    message_id: query.message.message_id,
    text: reply,
  });
}

async function telegram(env, method, body) {
  const response = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!result.ok) {
    console.error(`Telegram ${method} failed`, result.description);
  }
  return result;
}
