from warnings import filterwarnings
from telegram import Update
from telegram.ext import ConversationHandler, CallbackQueryHandler, MessageHandler, filters, ContextTypes
from telegram.warnings import PTBUserWarning

from _features.functions.empty_function_1.bot import empty_function_1
from bots.coin_angel.config import EMPTY_FUNCTION_1, EMPTY_FUNCTION_2
filterwarnings(action="ignore", message=r".*CallbackQueryHandler", category=PTBUserWarning)

#context.bot_data["app"] - this is instance of app manager-bot.

async def handle_empty_inline(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    data = query.data

    if data == "empty_function_1":
        await query.message.reply_text("Empty Function 1 triggered. Implement later.")
        return EMPTY_FUNCTION_1

    elif data == "empty_function_2":
        await query.message.reply_text("Empty Function 2 triggered. Implement later.")
        return EMPTY_FUNCTION_2

    return None


async def ask_param1_empty_function(update: Update, context):
    if update.message.text.lower() == "/start":
        return await context.bot_data["app"].reset_and_start(update, context)

    try:
        context.user_data['param1'] = float(update.message.text)  # Convert the input to float
    except ValueError:
        await update.message.reply_text("Invalid input for param1. Please enter a valid number.")
        return EMPTY_FUNCTION_1

    await update.message.reply_text("Please enter the second parameter (param2) for Empty Function 1:")
    return EMPTY_FUNCTION_2


async def ask_param2_empty_function(update: Update, context):
    if update.message.text.lower() == "/start":
        return await context.bot_data["app"].reset_and_start(update, context)

    try:
        context.user_data['param2'] = float(update.message.text)  # Convert the input to float
    except ValueError:
        await update.message.reply_text("Invalid input for param2. Please enter a valid number.")
        return EMPTY_FUNCTION_2

    param1 = context.user_data['param1']
    param2 = context.user_data['param2']

    empty_function_1(param1, param2)

    await update.message.reply_text(f"Empty_Function_1 executed with param1={param1} and param2={param2}.")
    return ConversationHandler.END


def get_empty_1_conv_handler(starter_command):
    return ConversationHandler(
        entry_points=[CallbackQueryHandler(starter_command, pattern="^empty_function_2$")],
        states={
            EMPTY_FUNCTION_1: [MessageHandler(filters.TEXT, ask_param1_empty_function)],
            EMPTY_FUNCTION_2: [MessageHandler(filters.TEXT, ask_param2_empty_function)],
        },
        fallbacks=[],
    )
