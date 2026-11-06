import asyncio
import logging

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    CallbackQueryHandler, CommandHandler, ContextTypes, ConversationHandler, MessageHandler, filters,
)

from bots.anabelle.commands.concert_ai_agent.concert_service import find_concerts, store

CONCERTS_MENU_CALLBACK = "concerts_menu"
WAITING_FOR_NAME = 1
MAX_CONCERTS_IN_REPLY = 10

KIND_LABELS = {"artists": "артиста", "cities": "місто"}


def _menu(chat_id: int) -> tuple[str, InlineKeyboardMarkup]:
    artists = ", ".join(name for _, name in store.names("artists", chat_id)) or "—"
    cities = ", ".join(name for _, name in store.names("cities", chat_id)) or "—"
    text = (
        "🎤 Концерти\n"
        f"Артисти: {artists}\n"
        f"Міста: {cities}\n\n"
        "Щодня о 10:00 я перевіряю, чи з'явились нові концерти, і пишу тобі."
    )
    buttons = InlineKeyboardMarkup([
        [InlineKeyboardButton("➕ Артист", callback_data="concerts_add:artists"),
         InlineKeyboardButton("➕ Місто", callback_data="concerts_add:cities")],
        [InlineKeyboardButton("➖ Видалити", callback_data="concerts_remove"),
         InlineKeyboardButton("🔎 Перевірити зараз", callback_data="concerts_check")],
    ])
    return text, buttons


async def show_menu(update: Update, context: ContextTypes.DEFAULT_TYPE):
    # Reached from /concerts or the "Концерти" button in the /start menu
    text, buttons = _menu(update.effective_chat.id)
    if update.callback_query:
        await update.callback_query.answer()
        await update.callback_query.edit_message_text(text, reply_markup=buttons)
    else:
        await update.effective_message.reply_text(text, reply_markup=buttons)


# ---- add an artist or a city (conversation) ----

async def ask_for_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    kind = query.data.removeprefix("concerts_add:")
    context.user_data["concerts_kind"] = kind
    await query.message.reply_text(f"Напиши {KIND_LABELS[kind]} (або /cancel):")
    return WAITING_FOR_NAME


async def save_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    kind = context.user_data.pop("concerts_kind", "artists")
    name = update.message.text.strip()
    added = store.add(kind, update.effective_chat.id, name)
    status = f"✅ Додано: {name}" if added else f"Вже є у списку: {name}"
    text, buttons = _menu(update.effective_chat.id)
    await update.message.reply_text(f"{status}\n\n{text}", reply_markup=buttons)
    return ConversationHandler.END


async def cancel_adding(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data.pop("concerts_kind", None)
    await update.message.reply_text("Скасовано.")
    return ConversationHandler.END


# ---- remove ----

async def show_remove_buttons(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    chat_id = update.effective_chat.id
    rows = [[InlineKeyboardButton(f"❌ 🎤 {name}", callback_data=f"concerts_rm:artists:{item_id}")]
            for item_id, name in store.names("artists", chat_id)]
    rows += [[InlineKeyboardButton(f"❌ 📍 {name}", callback_data=f"concerts_rm:cities:{item_id}")]
             for item_id, name in store.names("cities", chat_id)]
    rows.append([InlineKeyboardButton("⬅️ Назад", callback_data=CONCERTS_MENU_CALLBACK)])
    await query.edit_message_text("Що видалити?", reply_markup=InlineKeyboardMarkup(rows))


async def remove_item(update: Update, context: ContextTypes.DEFAULT_TYPE):
    _, kind, item_id = update.callback_query.data.split(":")
    store.remove(kind, update.effective_chat.id, int(item_id))
    await show_remove_buttons(update, context)


# ---- check now ----

async def check_now(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    chat_id = update.effective_chat.id
    if not store.names("artists", chat_id) or not store.names("cities", chat_id):
        await query.message.reply_text("Спочатку додай хоча б одного артиста і одне місто.")
        return

    progress = await query.message.reply_text("🔎 Шукаю концерти…")
    try:
        # requests is blocking; keep the bot responsive while it searches
        concerts = await asyncio.to_thread(find_concerts, chat_id)
    except Exception as error:
        logging.exception("Concert check failed")
        await progress.edit_text(f"⚠️ Не вдалося перевірити: {error}")
        return

    # Already shown here, so the daily check won't send them again
    store.mark_sent(chat_id, [concert.id for concert in concerts])
    if not concerts:
        await progress.edit_text("Поки що концертів немає. Я перевірятиму щодня.")
        return

    shown = concerts[:MAX_CONCERTS_IN_REPLY]
    text = f"Знайдено концертів: {len(concerts)}\n\n" + "\n\n".join(concert.as_text() for concert in shown)
    if len(concerts) > len(shown):
        text += f"\n\n…і ще {len(concerts) - len(shown)}"
    await progress.edit_text(text, disable_web_page_preview=True)


def get_concert_handlers():
    add_conversation = ConversationHandler(
        entry_points=[CallbackQueryHandler(ask_for_name, pattern="^concerts_add:")],
        states={WAITING_FOR_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, save_name)]},
        fallbacks=[CommandHandler("cancel", cancel_adding)],
    )
    return [
        add_conversation,
        CommandHandler("concerts", show_menu),
        CallbackQueryHandler(show_menu, pattern=f"^{CONCERTS_MENU_CALLBACK}$"),
        CallbackQueryHandler(show_remove_buttons, pattern="^concerts_remove$"),
        CallbackQueryHandler(remove_item, pattern="^concerts_rm:"),
        CallbackQueryHandler(check_now, pattern="^concerts_check$"),
    ]
