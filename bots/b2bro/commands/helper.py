from telegram import Update
from telegram.ext import ConversationHandler, ContextTypes


async def cancel(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Cancel.")
    return ConversationHandler.END