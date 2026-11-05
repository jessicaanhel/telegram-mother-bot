// Anabelle on a free Cloudflare Worker: Telegram posts every update to /telegram.
// For now only /start and Silpo; the Python bot (bots/anabelle) keeps the other features locally.
import { SLOTS, courierMessage } from "./silpo.js";

const SLOTS_PER_ROW = 3;
const SILPO_MENU_CALLBACK = "silpo_menu";
const SLOT_CALLBACK_PREFIX = "silpo_slot:";

const COMMANDS = [
  { command: "start", description: "Головне меню" },
  { command: "silpo", description: "Час приїзду кур'єра Сільпо" },
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
};

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
      await telegram(env, "sendMessage", {
        chat_id: chat.id,
        text: `Привіт, ${from.first_name}! Що зробимо?`,
        reply_markup: { inline_keyboard: [[{ text: "🛒 Кур'єр Сільпо", callback_data: SILPO_MENU_CALLBACK }]] },
      });
    } else if (text.startsWith("/silpo")) {
      await askForSlot(env, chat.id);
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
    await sendSlotToTablet(env, query);
  }
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

async function sendSlotToTablet(env, query) {
  const message = courierMessage(query.data.slice(SLOT_CALLBACK_PREFIX.length), new Date());

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
