import logging

from telegram import Update, InlineKeyboardMarkup, InlineKeyboardButton
from telegram.ext import ContextTypes, ConversationHandler, CallbackQueryHandler, MessageHandler, filters, CommandHandler

from bots.coin_angel.commands.trading.price_alert_service import PriceAlertManager

CHOOSING_COIN_NAME, CHOOSING_TARGET_PRICE = range(2)
AWAITING_DOOR_SELECTION = 3
alert_manager = PriceAlertManager()


async def start_price_alert_function(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    context.user_data.clear()
    await query.message.reply_text("Enter the coin name you'd like to track:")
    return CHOOSING_COIN_NAME

async def choose_coin_name(update: Update, context: ContextTypes.DEFAULT_TYPE):
    context.user_data["coin_name"] = update.message.text.strip()
    await update.message.reply_text("Enter the target price in $ (e.g., 40000):")
    return CHOOSING_TARGET_PRICE


async def choose_target_price(update: Update, context: ContextTypes.DEFAULT_TYPE):
    try:
        target_price = float(update.message.text.strip())
    except ValueError:
        await update.message.reply_text("Please enter a valid number for the price.")
        return CHOOSING_TARGET_PRICE

    coin_name = context.user_data["coin_name"]
    user_id = update.effective_user.id

    keyboard = [
        [InlineKeyboardButton("My Alerts", callback_data="get_alerts_for_user")],
        [InlineKeyboardButton("Create New Alert", callback_data="return_home")],
        [InlineKeyboardButton("Main menu", callback_data="reset_and_start")]
    ]
    reply_markup = InlineKeyboardMarkup(keyboard)

    alert_manager.add_price_alert(user_id=user_id, coin_name=coin_name, target_price=target_price)
    await update.message.reply_text(
        f"✔ Alert set for {coin_name} at ${target_price}",
        reply_markup=reply_markup
    )
    return AWAITING_DOOR_SELECTION

async def return_home(update, context):
    query = update.callback_query
    await query.answer()
    await query.edit_message_text("Choose a coin you want to track")
    return CHOOSING_COIN_NAME


async def show_user_alerts(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    if query:
        await query.answer()
        alerts = list(alert_manager.get_alerts_by_user(query.from_user.id))
        logging.info(alerts)

        if not alerts:
            await query.edit_message_text("You have no active alerts.")
        else:
            lines = []
            for alert in alerts:
                coin = alert.get("coin_name") or alert.get("coin", "UNKNOWN")
                price = alert.get("target_price", "N/A")
                lines.append(f"• {coin.upper()} at {price}$")
            text = "You have active alerts in your Coin Angel:\n" + "\n".join(lines)
            await query.edit_message_text(text)
    else:
        await update.message.reply_text("Unexpected error: no query or message.")


async def cancel_alert(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("✘ Alert creation canceled.")
    return ConversationHandler.END


conv_handler_setup_alerts = ConversationHandler(
    entry_points=[CallbackQueryHandler(start_price_alert_function, pattern="^setup_alert$")],
    states={
        CHOOSING_COIN_NAME: [MessageHandler(filters.TEXT & ~filters.COMMAND, choose_coin_name)],
        CHOOSING_TARGET_PRICE: [MessageHandler(filters.TEXT & ~filters.COMMAND, choose_target_price)],
    AWAITING_DOOR_SELECTION: [
            CallbackQueryHandler(show_user_alerts, pattern="^get_alerts_for_user$"),
            CallbackQueryHandler(return_home, pattern="^return_home$")
        ]
    },
    fallbacks=[CommandHandler("cancel", cancel_alert)],
)

