import logging
from datetime import datetime

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.error import TelegramError
from telegram.ext import CallbackQueryHandler, CommandHandler, ContextTypes

from bots.anabelle.commands.silpo.silpo_slots import KYIV_TIMEZONE, SLOTS, courier_message, slot_to_kyiv
from bots.anabelle.config import NOTIFIER_BOT_USERNAME

SLOTS_PER_ROW = 3
CALLBACK_PREFIX = "silpo_slot:"
SILPO_MENU_CALLBACK = "silpo_menu"


async def ask_for_slot(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Reached from /silpo or from the "Кур'єр Сільпо" button in the /start menu
    if update.callback_query:
        await update.callback_query.answer()

    buttons = [
        InlineKeyboardButton(slot, callback_data=CALLBACK_PREFIX + slot) for slot in SLOTS
    ]
    rows = [buttons[i:i + SLOTS_PER_ROW] for i in range(0, len(buttons), SLOTS_PER_ROW)]
    await update.effective_message.reply_text(
        "Обери час доставки Сільпо (як у застосунку, час NL):",
        reply_markup=InlineKeyboardMarkup(rows),
    )


async def send_slot_to_tablet(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()

    now = datetime.now(KYIV_TIMEZONE)
    kyiv_slot = slot_to_kyiv(query.data.removeprefix(CALLBACK_PREFIX), now)
    message = courier_message(kyiv_slot, now)

    # Bot-to-bot message: needs "Bot-to-Bot Communication Mode" on for this bot and the notifier bot.
    # The notifier bot's webhook delivers it to MacroDroid on the tablet, which reads it out.
    try:
        await context.bot.send_message(chat_id=NOTIFIER_BOT_USERNAME, text=message)
    except TelegramError as error:
        logging.error("Could not send Silpo slot to %s: %s", NOTIFIER_BOT_USERNAME, error)
        await query.edit_message_text(f"⚠️ Не вдалося передати на планшет: {error.message}")
        return

    await query.edit_message_text(f"✅ Передано на планшет:\n{message}")


def get_silpo_handlers():
    return [
        CommandHandler("silpo", ask_for_slot),
        CallbackQueryHandler(ask_for_slot, pattern=f"^{SILPO_MENU_CALLBACK}$"),
        CallbackQueryHandler(send_slot_to_tablet, pattern=f"^{CALLBACK_PREFIX}"),
    ]
