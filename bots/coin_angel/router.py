import logging


async def inline_router(update, context):
    """
    Central router for all Telegram inline button callbacks.
    Delegates to the correct feature handler based on callback data.
    """
    query = update.callback_query
    data = query.data
    await query.answer()

    # non-conversational functions only
    if data == "get_alerts_for_user":
        from bots.coin_angel.commands.trading.price_alert_handler import show_user_alerts
        return await show_user_alerts(update, context)

    elif data == "return_home":
        from bots.coin_angel.commands.trading.price_alert_handler import return_home
        return await return_home(update, context)

    elif data == "reset_and_start":
        logging.info(context.bot_data)
        return await context.bot_data["app"].reset_and_start(update, context)

    elif data == "empty_function_1":
        await query.answer()
        await query.message.reply_text("Empty Function 1 triggered. Implement later.")

    return None